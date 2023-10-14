// define error code map
const errorCodeMap = {
	E1000: "Email template could not be processed!",
}
// build up error message
errorCodeMap.build = function(code = '', message = '') {
	return String(`[${code}] ${message}`).trim()
}
module.exports.errors = errorCodeMap