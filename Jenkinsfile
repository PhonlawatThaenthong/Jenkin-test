pipeline {
    agent { docker { image 'node:20-alpine' } }

    environment {
        APP_NAME = 'taskflow-api'
        NODE_ENV = 'test'
    }

    options {
        timeout(time: 10, unit: 'MINUTES')
    }

    stages {
        stage('Install') {
            steps {
                dir('backend') { sh 'npm ci' }
            }
        }
        stage('Lint') {
            steps {
                dir('backend') { sh 'npm run lint' }
            }
        }
        stage('Unit Test') {
            steps {
                dir('backend') { sh 'npm test' }
            }
        }
    }

    post {
        success { echo "${env.APP_NAME} passed on ${env.NODE_ENV}" }
        failure { echo "Failed at stage: ${env.STAGE_NAME}" }
        always  { archiveArtifacts artifacts: 'backend/npm-debug.log*', allowEmptyArchive: true }
    }
}