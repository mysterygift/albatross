export const MIN_PASSWORD_LENGTH = 8
export const MAX_USERNAME_LENGTH = 128

export type InitialAdminCredentialInput = {
  username: string
  password: string
  confirmPassword: string
}

export type InitialAdminCredentialChecklist = {
  minLength: boolean
  passwordsMatch: boolean
}

export type InitialAdminCredentialValidation = {
  ok: boolean
  fieldErrors: Partial<Record<'username' | 'password' | 'confirmPassword', string>>
  checklist: InitialAdminCredentialChecklist
}

export function validateInitialAdminCredentials(
  input: InitialAdminCredentialInput
): InitialAdminCredentialValidation {
  const username = input.username.trim().toLowerCase()
  const fieldErrors: InitialAdminCredentialValidation['fieldErrors'] = {}
  const checklist: InitialAdminCredentialChecklist = {
    minLength: input.password.length >= MIN_PASSWORD_LENGTH,
    passwordsMatch: input.password.length > 0 && input.password === input.confirmPassword,
  }

  if (!username) {
    fieldErrors.username = 'Username is required'
  } else if (username.length > MAX_USERNAME_LENGTH) {
    fieldErrors.username = 'Username is too long'
  }

  if (!input.password) {
    fieldErrors.password = 'Password is required'
  } else if (!checklist.minLength) {
    fieldErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }

  if (!input.confirmPassword) {
    fieldErrors.confirmPassword = 'Password confirmation is required'
  } else if (!checklist.passwordsMatch) {
    fieldErrors.confirmPassword = 'Passwords do not match'
  }

  return {
    ok: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    checklist,
  }
}

export function assertInitialAdminCredentialShape(input: InitialAdminCredentialInput): {
  username: string
  password: string
} {
  const validation = validateInitialAdminCredentials(input)
  if (!validation.ok) {
    const firstError =
      validation.fieldErrors.username ??
      validation.fieldErrors.password ??
      validation.fieldErrors.confirmPassword
    throw new Error(firstError ?? 'Invalid credentials')
  }
  return {
    username: input.username.trim().toLowerCase(),
    password: input.password,
  }
}
