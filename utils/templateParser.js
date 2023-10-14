const fs = require('fs/promises');
const path = require('path');

/////////////////////////////////////////////////////
// parse email template file and substitute values //
/////////////////////////////////////////////////////
const templateParser = async (filePath = '', data = {}, dir = '/templates/') => {
	try {
		// get full file path
		const file = path.join(process.cwd() + dir + filePath)
		// check if text is valid
		if (file && fs.access(file, fs.F_OK)) {
			// get template content
			let content = await fs.readFile(file, { encoding: 'utf-8' });
			// loop through data object and replace value
			for (let key in data)
				content = content.replaceAll(`{${key}}`, data[key]);

			return content;
		}
	} catch (err) { console.log(err); }
	return '';
}

//////////////////////////
// resolve host address //
//////////////////////////
templateParser.host = function() {
	return process.env.REMOTE_HOST
}

module.exports = templateParser