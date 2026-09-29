// Lab 10 capstone: taskflow-api end-to-end pipeline.
// Every build/test/scan stage runs in an ephemeral Kubernetes pod (ci/k8s/api-pod.yaml),
// independent checks run in parallel (fail fast), dependent steps stay sequential:
//   checks -> supply chain -> quality -> E2E -> build -> scan -> deploy -> health gate -> production.
// Secrets are only ever bound through credentials: cosign-key, cosign-password, kubeconfig-kind,
// the SonarQube server token (withSonarQubeEnv) and the Kubernetes Secret taskflow-ci-env.

def notify(String status) {
    def to = env.NOTIFY_EMAIL   // set once in Manage Jenkins > System > Global properties
    def branch = env.BRANCH_NAME ?: 'n/a'
    def subject = "[${status}] ${env.JOB_NAME} #${env.BUILD_NUMBER} (${branch})"
    def body = """${status}: ${env.JOB_NAME} #${env.BUILD_NUMBER}
Branch: ${branch}
Commit: ${env.GIT_COMMIT ?: 'n/a'}
Build:  ${env.BUILD_URL}
"""
    if (to) {
        mail to: to, subject: subject, body: body
    } else {
        echo "NOTIFY_EMAIL not set; notification would be: ${subject}"
    }
}

pipeline {
    agent none

    environment {
        APP_NAME       = 'taskflow-api'
        PUSH_REGISTRY  = 'kind-registry:5000'   // registry as seen from pods (kind network)
        PULL_REGISTRY  = 'localhost:5001'       // same registry as seen by kind nodes (containerd mirror)
    }

    parameters {
        booleanParam(name: 'SIMULATE_FAILURE', defaultValue: false,
                     description: 'Fail right after checkout (drives the build success rate down for the health gate demo)')
        booleanParam(name: 'SIMULATE_BROKEN', defaultValue: false,
                     description: 'Lab 07: deploy a tag that does not exist, to prove the automatic rollback')
    }

    options {
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    stages {
        stage('CI on Kubernetes') {
            agent {
                kubernetes {
                    yamlFile 'ci/k8s/api-pod.yaml'
                }
            }
            stages {
                stage('Simulated Failure') {
                    when { expression { params.SIMULATE_FAILURE } }
                    steps { error 'SIMULATE_FAILURE=true: failing on purpose (health gate demo)' }
                }

                stage('Install') {
                    steps {
                        container('node') {
                            sh 'echo "pod: $(hostname)"'
                            dir('backend') { sh 'npm ci' }
                        }
                        // Install syft, cosign and opa once here: running apk/curl installs from two
                        // parallel branches in the same container fails on the apk database lock.
                        container('supplychain') {
                            sh '''
                                apk add --no-cache curl >/dev/null
                                curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
                                curl -sSfL -o /usr/local/bin/cosign \
                                  https://github.com/sigstore/cosign/releases/download/v2.4.1/cosign-linux-amd64
                                curl -sSfL -o /usr/local/bin/opa \
                                  https://openpolicyagent.org/downloads/v0.70.0/opa_linux_amd64_static
                                chmod +x /usr/local/bin/cosign /usr/local/bin/opa
                                syft version | head -2; cosign version 2>/dev/null | grep GitVersion; opa version | head -1
                            '''
                        }
                    }
                }

                stage('Checks') {
                    failFast true
                    parallel {
                        stage('Secrets Detection') {
                            steps {
                                container('gitleaks') {
                                    sh '''
                                        git config --global --add safe.directory '*'
                                        mkdir -p reports
                                        gitleaks detect --source . --redact --verbose \
                                          --report-format sarif --report-path reports/gitleaks.sarif
                                    '''
                                }
                            }
                            post { always { archiveArtifacts artifacts: 'reports/gitleaks.sarif', allowEmptyArchive: true } }
                        }
                        stage('Lint') {
                            steps {
                                container('node') {
                                    // no --fix in CI: report problems, never rewrite the checkout
                                    dir('backend') { sh 'npx eslint "{src,test}/**/*.ts"' }
                                }
                            }
                        }
                        stage('SAST - ESLint') {
                            steps {
                                container('node') {
                                    dir('backend') {
                                        sh 'mkdir -p reports && npx eslint src/ -f @microsoft/eslint-formatter-sarif -o reports/eslint.sarif'
                                    }
                                }
                            }
                            post { always { archiveArtifacts artifacts: 'backend/reports/eslint.sarif', allowEmptyArchive: true } }
                        }
                        stage('SAST - Semgrep') {
                            steps {
                                container('semgrep') {
                                    sh '''
                                        mkdir -p reports
                                        HOME=/tmp semgrep scan --config=p/owasp-top-ten --config=p/nodejs \
                                          --sarif --output reports/semgrep.sarif backend/src
                                    '''
                                }
                            }
                            post { always { archiveArtifacts artifacts: 'reports/semgrep.sarif', allowEmptyArchive: true } }
                        }
                        stage('SCA - npm audit') {
                            steps {
                                container('node') {
                                    dir('backend') {
                                        script {
                                            sh 'mkdir -p reports && npm audit --audit-level=high --json > reports/audit.json || true'
                                            def critical = sh(script: "node -p \"require('./reports/audit.json').metadata.vulnerabilities.critical\"",
                                                              returnStdout: true).trim().toInteger()
                                            def high = sh(script: "node -p \"require('./reports/audit.json').metadata.vulnerabilities.high\"",
                                                          returnStdout: true).trim().toInteger()
                                            if (critical > 0) {
                                                // Stage red, but let the Policy Gate be the step that blocks.
                                                catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                                                    error("Blocking: ${critical} critical vulnerabilities found")
                                                }
                                            } else {
                                                echo "SCA: 0 critical, ${high} high (threshold blocks only on critical)"
                                            }
                                        }
                                    }
                                }
                            }
                            post { always { archiveArtifacts artifacts: 'backend/reports/audit.json', allowEmptyArchive: true } }
                        }
                        stage('Unit Test') {
                            steps {
                                container('node') {
                                    dir('backend') {
                                        sh 'npm test -- --coverage --maxWorkers=2 --reporters=default --reporters=jest-junit'
                                    }
                                }
                            }
                            post {
                                always {
                                    junit allowEmptyResults: true, testResults: 'backend/reports/junit.xml'
                                    recordCoverage(tools: [[parser: 'COBERTURA',
                                                            pattern: 'backend/coverage/cobertura-coverage.xml']])
                                }
                            }
                        }
                    }
                }

                stage('Supply Chain') {
                    parallel {
                        stage('SBOM + Sign') {
                            steps {
                                container('supplychain') {
                                    sh '''
                                        mkdir -p reports
                                        syft dir:backend --source-name taskflow-api -o cyclonedx-json=reports/taskflow-api.cdx.json
                                    '''
                                    withCredentials([file(credentialsId: 'cosign-key', variable: 'COSIGN_KEY'),
                                                     string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')]) {
                                        sh '''
                                            cosign sign-blob --yes --tlog-upload=false --key "$COSIGN_KEY" \
                                              --output-signature reports/taskflow-api.cdx.json.sig reports/taskflow-api.cdx.json
                                            cosign verify-blob --insecure-ignore-tlog=true --key policy/cosign.pub \
                                              --signature reports/taskflow-api.cdx.json.sig reports/taskflow-api.cdx.json
                                            # cosign writes the signature as 0600 root; make it readable for the
                                            # jnlp container (uid 1000) or archiveArtifacts cannot copy it.
                                            chmod a+r reports/taskflow-api.cdx.json reports/taskflow-api.cdx.json.sig
                                        '''
                                    }
                                }
                            }
                            post {
                                always {
                                    archiveArtifacts artifacts: 'reports/taskflow-api.cdx.json, reports/taskflow-api.cdx.json.sig',
                                                     allowEmptyArchive: true
                                }
                            }
                        }
                        stage('Policy Gate') {
                            steps {
                                container('supplychain') {
                                    sh '''
                                        opa eval --fail-defined --format pretty \
                                          -d policy/security.rego -i backend/reports/audit.json 'data.security.deny[msg]'
                                    '''
                                }
                            }
                        }
                    }
                }

                stage('SonarQube Analysis') {
                    environment { SONAR_USER_HOME = "${env.WORKSPACE}/.sonar" }
                    steps {
                        container('sonar') {
                            dir('backend') {
                                withSonarQubeEnv('SonarQube') {
                                    sh 'sonar-scanner -Dsonar.projectKey=taskflow-api'
                                }
                            }
                        }
                    }
                }
                stage('Quality Gate') {
                    steps {
                        timeout(time: 5, unit: 'MINUTES') {
                            waitForQualityGate abortPipeline: true
                        }
                    }
                }

                stage('E2E') {
                    steps {
                        container('node') {
                            dir('backend') {
                                // DB_* come from the taskflow-ci-env Secret; postgres is a sidecar on 127.0.0.1.
                                sh '''
                                    npm run build
                                    export DB_HOST=127.0.0.1
                                    # retry until the postgres sidecar accepts connections
                                    for i in $(seq 1 30); do
                                      node node_modules/typeorm/cli.js migration:run -d dist/config/data-source.js && break
                                      sleep 2
                                    done
                                    nohup node dist/main.js > api.log 2>&1 &
                                    for i in $(seq 1 30); do
                                      wget -qO- http://127.0.0.1:3000/health/live && break
                                      sleep 2
                                    done
                                '''
                            }
                        }
                        container('postgres') {
                            sh '''psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
                                "INSERT INTO rooms (name, type, price_per_night, capacity) VALUES ('E2E Room', 'standard', 1500, 2);"'''
                        }
                        container('playwright') {
                            dir('e2e') {
                                withEnv(['BASE_URL=http://127.0.0.1:3000', 'CI=true', "npm_config_cache=${env.WORKSPACE}/.npm"]) {
                                    sh 'npm ci && npx playwright test'
                                }
                            }
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'e2e/results/junit.xml'
                            publishHTML(target: [reportDir: 'e2e/playwright-report', reportFiles: 'index.html',
                                                 reportName: 'Playwright Report', keepAll: true,
                                                 alwaysLinkToLastBuild: true, allowMissing: true])
                            archiveArtifacts artifacts: 'backend/api.log', allowEmptyArchive: true
                        }
                    }
                }

                stage('Build Image') {
                    steps {
                        script { env.IMAGE_TAG = env.GIT_COMMIT.take(7) }
                        container('kaniko') {
                            // Immutable tag from the commit, never :latest. Lab registry is unauthenticated;
                            // with a real registry, bind usernamePassword(credentialsId: 'registry-creds') here.
                            sh '''
                                /kaniko/executor --context "dir://$WORKSPACE/backend" \
                                  --dockerfile "$WORKSPACE/backend/Dockerfile" --target production \
                                  --destination "$PUSH_REGISTRY/taskflow-api:$IMAGE_TAG" \
                                  --insecure --skip-tls-verify
                            '''
                        }
                    }
                }
                stage('Container Scan') {
                    steps {
                        container('trivy') {
                            sh '''
                                mkdir -p reports
                                IMG="$PUSH_REGISTRY/taskflow-api:$IMAGE_TAG"
                                trivy image --insecure --severity HIGH,CRITICAL --ignore-unfixed "$IMG"
                                trivy image --insecure --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
                                  --format sarif --output reports/trivy.sarif "$IMG"
                            '''
                        }
                    }
                    post { always { archiveArtifacts artifacts: 'reports/trivy.sarif', allowEmptyArchive: true } }
                }

                stage('Blue/Green Deploy') {
                    when { not { changeRequest() } }
                    steps {
                        container('kubectl') {
                            withCredentials([file(credentialsId: 'kubeconfig-kind', variable: 'KUBECONFIG')]) {
                                script {
                                    env.BG_CURRENT = sh(script: "kubectl -n default get svc taskflow -o jsonpath='{.spec.selector.color}'",
                                                        returnStdout: true).trim()
                                    env.BG_NEXT = env.BG_CURRENT == 'blue' ? 'green' : 'blue'
                                    def image = "${env.PULL_REGISTRY}/taskflow-api:${env.IMAGE_TAG}"
                                    def target = params.SIMULATE_BROKEN ? "${image}-broken" : image
                                    sh 'mkdir -p reports && kubectl -n default get svc taskflow -o yaml > reports/svc-before.yaml'
                                    sh "kubectl -n default set image deployment/taskflow-${env.BG_NEXT} app=${target}"
                                    sh "kubectl -n default rollout status deployment/taskflow-${env.BG_NEXT} --timeout=120s"
                                    // Smoke test the idle colour directly, before any user traffic reaches it.
                                    sh "curl -sf http://taskflow-${env.BG_NEXT}.default.svc.cluster.local:8080/health/live"
                                    sh "kubectl -n default patch svc taskflow -p '{\"spec\":{\"selector\":{\"color\":\"${env.BG_NEXT}\"}}}'"
                                    sh 'kubectl -n default get svc taskflow -o yaml > reports/svc-after.yaml'
                                    echo "Switched traffic from ${env.BG_CURRENT} to ${env.BG_NEXT}"
                                }
                            }
                        }
                    }
                    post {
                        failure {
                            container('kubectl') {
                                withCredentials([file(credentialsId: 'kubeconfig-kind', variable: 'KUBECONFIG')]) {
                                    script {
                                        if (env.BG_CURRENT) {
                                            echo "ROLLBACK: pointing Service taskflow back to ${env.BG_CURRENT}"
                                            sh "kubectl -n default patch svc taskflow -p '{\"spec\":{\"selector\":{\"color\":\"${env.BG_CURRENT}\"}}}'"
                                            sh "kubectl -n default rollout undo deployment/taskflow-${env.BG_NEXT} || true"
                                            sh 'kubectl -n default get svc taskflow -o yaml > reports/svc-after-rollback.yaml'
                                        }
                                    }
                                }
                            }
                        }
                        always { archiveArtifacts artifacts: 'reports/svc-*.yaml', allowEmptyArchive: true }
                    }
                }

                stage('Deploy - Staging') {
                    when { branch 'develop' }
                    steps { echo 'deploying to staging...' }
                }

                stage('Pipeline Health Gate') {
                    when { branch 'main' }
                    steps {
                        container('kubectl') {
                            withEnv(["HEALTH_JOB=${env.JOB_NAME}", 'PROM_URL=http://prometheus:9090',
                                     'HEALTH_THRESHOLD=0.90', 'HEALTH_WINDOW=24h']) {
                                sh 'sh ci/health-gate.sh'
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy - Production') {
            when {
                beforeInput true   // evaluate the branch first, or the input pauses every branch
                branch 'main'
            }
            input { message 'Health gate passed. Promote to production?' }
            steps {
                echo "Promoting ${env.APP_NAME}:${env.IMAGE_TAG} to production"
            }
        }
    }

    post {
        success { notify('SUCCESS') }
        failure { notify('FAILURE') }
    }
}
