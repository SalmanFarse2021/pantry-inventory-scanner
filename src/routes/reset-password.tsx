import { createFileRoute } from '@tanstack/react-router'
import { ResetPasswordScreen } from '../features/auth/ResetPasswordScreen'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordScreen,
})
