// Every simulated flow, in the order they appear in the switcher.
// To add one, create a file next to these that exports the same shape.
import login from './login.js'
import userCreation from './user-creation.js'

export const flows = [login, userCreation]
