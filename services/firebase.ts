import { credential } from 'firebase-admin'
import { initializeApp } from 'firebase-admin/app'
import { Auth, getAuth } from 'firebase-admin/auth'

import { env } from '../constants/env'

let auth: Auth

const initialize_firebase = async () => {
  console.log('Initializing Firebase', env.serviceAccountKeyPath)
  if (!env.serviceAccountKeyPath) {
    console.log('Firebase config path not set')
  }

  const { default: service_account } = await import(env.serviceAccountKeyPath)

  const firebase_app = initializeApp({
    credential: credential.cert(service_account)
  })

  return getAuth(firebase_app)
}

initialize_firebase()
  .then((initialized_auth) => {
    auth = initialized_auth
  })
  .catch((error) => {
    console.error('Failed to initialize Firebase:', error)
  })

export default () => {
  if (!auth) {
    console.log('Firebase Auth has not been initialized')
  }
  return auth
}

