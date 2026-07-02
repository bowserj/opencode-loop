// Plugin entry. OpenCode's loader treats EVERY export of this module as a
// plugin factory and rejects non-function exports, so nothing but the plugin
// itself may be exported here. Implementation and test-only exports live in
// loop.js.
import { OpenCodeLoopPlugin } from "./loop.js"

export { OpenCodeLoopPlugin }
export default OpenCodeLoopPlugin
