////////////////////////////////////////////
// resolve host and pass into environment //
////////////////////////////////////////////
const resolveHost = function(req, res, next) {
	// check if variable not yet set
	if (!process.env.REMOTE_HOST) {
		process.env.REMOTE_HOST = req.protocol + '://' + req.get('host')
	}
	
	next()
}

module.exports = resolveHost