import axios from 'axios'
import { toast } from 'sonner'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

let toastTimeout: ReturnType<typeof setTimeout> | null = null

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Unknown error'

    if (toastTimeout) clearTimeout(toastTimeout)
    toastTimeout = setTimeout(() => {
      if (error.code === 'ERR_NETWORK' || message.includes('ECONNREFUSED')) {
        toast.error('Backend unreachable', {
          description: 'Make sure the backend is running on port 3001',
        })
      } else if (error.response?.status === 409) {
        toast.info('Cycle already running')
      } else {
        toast.error('API Error', { description: message })
      }
    }, 100)

    return Promise.reject(error)
  }
)
