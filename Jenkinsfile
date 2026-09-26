pipeline {
    agent any

    environment {
        APP_NAME = 'taskflow-api'
        NODE_ENV = 'test'
        COMPOSE_PROJECT_NAME = 'taskflow-ci'
    }

    options {
        // A hung npm install, image build or test run would hold the executor forever and
        // block every queued build; a hard ceiling fails fast. 45 min covers security scans + build + Sonar + E2E.
        timeout(time: 45, unit: 'MINUTES')
    }

    stages {
        stage('Secrets Detection') {
            agent {
                docker {
                    image 'zricethezav/gitleaks:latest'
                    args '--entrypoint='
                    reuseNode true
                }
            }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                // Scans every commit reachable from this branch, not just the working tree.
                sh '''
                    mkdir -p reports
                    gitleaks detect --source . --redact --verbose \
                      --report-format sarif --report-path reports/gitleaks.sarif
                '''
            }
            post { always { archiveArtifacts artifacts: 'reports/gitleaks.sarif', allowEmptyArchive: true } }
        }
        stage('Install') {
            agent { docker { image 'node:20-alpine'; reuseNode true } }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') { sh 'npm ci' }
            }
        }
        stage('Lint') {
            agent { docker { image 'node:20-alpine'; reuseNode true } }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') { sh 'npm run lint' }
            }
        }
        stage('SAST - ESLint') {
            agent { docker { image 'node:20-alpine'; reuseNode true } }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') {
                    sh '''
                        mkdir -p reports
                        npx eslint src/ -f @microsoft/eslint-formatter-sarif -o reports/eslint.sarif
                    '''
                }
            }
            post { always { archiveArtifacts artifacts: 'backend/reports/eslint.sarif', allowEmptyArchive: true } }
        }
        stage('SAST - Semgrep') {
            agent {
                docker {
                    image 'semgrep/semgrep:latest'
                    args '--entrypoint='
                    reuseNode true
                }
            }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                sh '''
                    mkdir -p reports
                    HOME=/tmp semgrep scan --config=p/owasp-top-ten --config=p/nodejs \
                      --sarif --output reports/semgrep.sarif backend/src
                '''
            }
            post { always { archiveArtifacts artifacts: 'reports/semgrep.sarif', allowEmptyArchive: true } }
        }
        stage('SCA - npm audit') {
            agent { docker { image 'node:20-alpine'; reuseNode true } }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') {
                    script {
                        sh 'mkdir -p reports && npm audit --audit-level=high --json > reports/audit.json || true'
                        def critical = sh(
                            script: "node -p \"require('./reports/audit.json').metadata.vulnerabilities.critical\"",
                            returnStdout: true
                        ).trim().toInteger()
                        def high = sh(
                            script: "node -p \"require('./reports/audit.json').metadata.vulnerabilities.high\"",
                            returnStdout: true
                        ).trim().toInteger()
                        if (critical > 0) {
                            // Mark the stage red but keep going, so SBOM and the Policy Gate still
                            // run and the policy is the step that actually blocks the release.
                            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                                error("Blocking: ${critical} critical vulnerabilities found")
                            }
                        } else if (high > 0) {
                            echo "SCA WARNING: ${high} high vulnerabilities (allowed: threshold blocks only on critical)"
                        } else {
                            echo 'SCA passed with 0 critical and 0 high vulnerabilities'
                        }
                    }
                }
            }
            post { always { archiveArtifacts artifacts: 'backend/reports/audit.json', allowEmptyArchive: true } }
        }
        stage('Generate SBOM') {
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                // syft and cosign images have no shell, so run them with plain `docker run`
                // sharing Jenkins' volumes instead of as a docker agent.
                sh '''
                    mkdir -p reports
                    docker run --rm --volumes-from "$(hostname)" -w "$WORKSPACE" -u "$(id -u):$(id -g)" -e HOME="$WORKSPACE" \
                      anchore/syft:latest dir:backend \
                      --source-name taskflow-api -o cyclonedx-json=reports/taskflow-api.cdx.json
                '''
                withCredentials([file(credentialsId: 'cosign-key', variable: 'COSIGN_KEY'),
                                 string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')]) {
                    sh '''
                        docker run --rm --volumes-from "$(hostname)" -w "$WORKSPACE" -u "$(id -u):$(id -g)" -e HOME="$WORKSPACE" \
                          -e COSIGN_PASSWORD gcr.io/projectsigstore/cosign:v2.4.1 \
                          sign-blob --yes --tlog-upload=false --key "$COSIGN_KEY" \
                          --output-signature reports/taskflow-api.cdx.json.sig reports/taskflow-api.cdx.json
                        docker run --rm --volumes-from "$(hostname)" -w "$WORKSPACE" -u "$(id -u):$(id -g)" -e HOME="$WORKSPACE" \
                          gcr.io/projectsigstore/cosign:v2.4.1 \
                          verify-blob --insecure-ignore-tlog=true --key policy/cosign.pub \
                          --signature reports/taskflow-api.cdx.json.sig reports/taskflow-api.cdx.json
                    '''
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
                script { env.FAILED_STAGE = env.STAGE_NAME }
                // --fail-defined: exit 1 when any deny message exists, which fails this stage.
                sh '''
                    docker run --rm --volumes-from "$(hostname)" -w "$WORKSPACE" -u "$(id -u):$(id -g)" -e HOME="$WORKSPACE" \
                      openpolicyagent/opa:latest eval --fail-defined --format pretty \
                      -d policy/security.rego -i backend/reports/audit.json 'data.security.deny[msg]'
                '''
            }
        }
        stage('Unit Test') {
            agent { docker { image 'node:20-alpine'; reuseNode true } }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') {
                    sh 'npm test -- --coverage --reporters=default --reporters=jest-junit'
                }
            }
            post {
                always {
                    junit 'backend/reports/junit.xml'
                    recordCoverage(tools: [[parser: 'COBERTURA',
                                            pattern: 'backend/coverage/cobertura-coverage.xml']])
                }
            }
        }
        stage('SonarQube Analysis') {
            agent {
                docker {
                    image 'sonarsource/sonar-scanner-cli:latest'
                    args '--entrypoint='
                    reuseNode true
                }
            }
            environment { SONAR_USER_HOME = "${env.WORKSPACE}/.sonar" }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') {
                    withSonarQubeEnv('SonarQube') {
                        sh 'sonar-scanner -Dsonar.projectKey=taskflow-api'
                    }
                }
            }
        }
        stage('Quality Gate') {
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }
        stage('E2E - Start API') {
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') {
                    sh '''
                        cp .env.ci .env
                        docker compose up -d --build
                        for i in $(seq 1 30); do
                          docker compose exec -T api wget -qO- http://127.0.0.1:3000/health/live && break
                          sleep 2
                        done
                        docker compose exec -T api node node_modules/typeorm/cli.js migration:run -d dist/config/data-source.js
                        docker compose exec -T postgres psql -U poonsuk -d poonsuk -c \
                          "INSERT INTO rooms (name, type, price_per_night, capacity) VALUES ('E2E Room', 'standard', 1500, 2);"
                    '''
                }
            }
        }
        stage('E2E - Playwright') {
            agent {
                docker {
                    image 'mcr.microsoft.com/playwright:v1.55.0-noble'
                    args '--network taskflow-ci_default'
                    reuseNode true
                }
            }
            environment {
                BASE_URL = 'http://api:3000'
                CI = 'true'
                npm_config_cache = "${env.WORKSPACE}/.npm"
            }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('e2e') { sh 'npm ci && npx playwright test' }
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'e2e/results/junit.xml'
                    publishHTML(target: [reportDir: 'e2e/playwright-report', reportFiles: 'index.html',
                                         reportName: 'Playwright Report', keepAll: true,
                                         alwaysLinkToLastBuild: true, allowMissing: true])
                }
            }
        }
        stage('Deploy - Staging') {
            when { branch 'develop' }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                sh 'echo deploying to staging...'
            }
        }
        stage('Deploy - Production') {
            when {
                beforeInput true   // evaluate the branch check first, or input pauses every branch
                branch 'main'
            }
            input { message 'Deploy to production?' }
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                sh 'echo deploying to production...'
            }
        }
    }

    post {
        success { echo "${env.APP_NAME} passed on ${env.NODE_ENV}" }
        failure { echo "Failed at stage: ${env.FAILED_STAGE}" }
        always {
            dir('backend') { sh 'docker compose down -v --remove-orphans || true' }
            archiveArtifacts artifacts: 'backend/npm-debug.log*, e2e/playwright-report/**',
                             allowEmptyArchive: true
        }
    }
}