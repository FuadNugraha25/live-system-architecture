// Every simulated flow, in the order they appear in the switcher.
// To add one, create a file (or a folder with an index.js) next to these that exports the same shape.
import login from './login.js'
import userCreation from './user-creation.js'
import extractProperty from './extract-property/index.js'

export const flows = [login, userCreation, extractProperty]
