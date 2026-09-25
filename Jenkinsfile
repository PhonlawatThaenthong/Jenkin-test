pipeline {
    agent { docker { image 'node:20-alpine' } }

    environment {
        APP_NAME = 'taskflow-api'
        NODE_ENV = 'test'
    }

    options {
        // A hung npm install/test (network stall, open handle, waiting on stdin) would hold
        // the executor forever and block every queued build; a hard timeout fails fast instead.
        timeout(time: 10, unit: 'MINUTES')
    }

    stages {
        stage('Install') {
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') { sh 'npm ci' }
            }
        }
        stage('Lint') {
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') { sh 'npm run lint' }
            }
        }
        stage('Unit Test') {
            steps {
                script { env.FAILED_STAGE = env.STAGE_NAME }
                dir('backend') { sh 'npm test' }
            }
        }
    }

    post {
        success { echo "${env.APP_NAME} passed on ${env.NODE_ENV}" }
        failure { echo "Failed at stage: ${env.FAILED_STAGE}" }
        always  { archiveArtifacts artifacts: 'backend/npm-debug.log*, npm-debug.log*', allowEmptyArchive: true }
    }
}