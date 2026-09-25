pipeline {
    agent any

    environment {
        APP_NAME = 'taskflow-api'
        NODE_ENV = 'test'
        COMPOSE_PROJECT_NAME = 'taskflow-ci'
    }

    options {
        // A hung npm install, image build or test run would hold the executor forever and
        // block every queued build; a hard ceiling fails fast. 30 min covers build + Sonar + E2E.
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {
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
            when { branch 'main' }
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