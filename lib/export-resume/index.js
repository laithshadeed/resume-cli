var themeServer = process.env.THEME_SERVER || 'http://themes.jsonresume.org/theme/';
var registryServer = process.env.REGISTRY_SERVER || 'http://registry.jsonresume.org';
var request = require('superagent');
var http = require('http');
var fs = require('fs');
var path = require('path');
var read = require('read');
var spinner = require("char-spinner");
var menu = require('./menu');
var chalk = require('chalk');

var SUPPORTED_FILE_FORMATS = ["html", "pdf"];

module.exports = function exportResume(resumeJson, fileName, program, callback) {
  var theme = program.theme;

  if (!fileName) {
    read({
      prompt: "Provide a file name: ",
      default: 'resume'
    }, function(er, fileName) {
      if (er) return console.log();
      var fileName = fileName;
      fileNameAndFormat = getFileNameAndFormat(fileName, program.format);
      var fileFormatToUse = fileNameAndFormat.fileFormatToUse;
      fileName = fileNameAndFormat.fileName;

      menu.extension(fileFormatToUse, function(format) {
        if (format === '.html') {
          sendExportRequest(resumeJson, fileName, theme, format, function() {
            callback(null, fileName, format);
          });
        } else if (format === '.pdf') {
          sendExportPDFRequest(resumeJson, fileName, theme, format, function() {
            callback(null, fileName, format);
          });
        }
      });
    });
  } else {
    var fileNameAndFormat = getFileNameAndFormat(fileName, program.format);
    originalFileName = fileName;
    fileName = fileNameAndFormat.fileName;
    var fileFormatToUse = fileNameAndFormat.fileFormatToUse;

    if (theme.match('/')) {
      // Assume local theme
      exportFromLocal(resumeJson, originalFileName, theme, callback);
    } else {
      menu.extension(fileFormatToUse, function(format) {
        if (format === '.html') {
          sendExportRequest(resumeJson, fileName, theme, format, function() {
            callback(null, fileName, format);
          });
        } else if (format === '.pdf') {
          sendExportPDFRequest(resumeJson, fileName, theme, format, function() {
            callback(null, fileName, format);
          });
        }
      });
    }
  }
}

function extractFileFormat(fileName) {
  var dotPos = fileName.lastIndexOf('.');
  if (dotPos === -1) {
    return null;
  }
  return fileName.substring(dotPos + 1).toLowerCase();
}

function sendExportRequest(resumeJson, fileName, theme, format, callback) {
  spinner();
  request
    .post(themeServer + theme)
    .send({
      resume: resumeJson
    })
    .set('Accept', 'application/json')
    .end(function(err, response) {
      if (!response) {
        console.log(chalk.red('Unable to extablish connection to the theme server.'));
        console.log('Check your network connection');
        process.exit();
      }
      if (response.body.code === 'theme_not_found') {
        console.log(chalk.red('Unable to find that theme on npm, export aborted'));
        console.log('To see a dump of all available themes goto', 'http://themes.jsonresume.org/themes.json');
        process.exit();

      }
      fs.writeFileSync(path.resolve(process.cwd(), fileName + format), response.text);
      callback();
    });
  return;
}

function sendExportPDFRequest(resumeJson, fileName, theme, format, callback) {
  spinner();
  var stream = fs.createWriteStream(path.resolve(process.cwd(), fileName + format));
  var req = request
    .get(registryServer + '/pdf')
    .send({
      resume: resumeJson,
      theme: theme
    })
    .set('Accept', 'application/json');

  req.pipe(stream);
  stream.on('finish', function() {
    stream.close(callback);
  });
  return;
}

function getFileNameAndFormat(fileName, format) {
  var fileFormatFound = extractFileFormat(fileName);
  var fileFormatToUse = format;
  if (format && fileFormatFound && format === fileFormatFound) {
    fileName = fileName.substring(0, fileName.lastIndexOf('.'));
  } else if (fileFormatFound) {
    fileFormatToUse = fileFormatFound;
    fileName = fileName.substring(0, fileName.lastIndexOf('.'));
  }
  if (SUPPORTED_FILE_FORMATS.indexOf(fileFormatToUse) === -1) {
    fileFormatToUse = null;
  }
  return {
    fileName: fileName,
    fileFormatToUse: fileFormatToUse
  };
}

function exportFromLocal(resumeJson, fileName, theme, callback) {
  var packageJson = {};
  var themePath = process.cwd();

  // It means possibly the provided theme needs to be resolved locally
  if (theme.match('/')) {
    // If it starts with . or .. then I will prepend cwd
    if (theme.match(/^\.{1,2}/)) {
      theme = path.join(process.cwd(), theme);
    }

    themePath = path.normalize(theme);
  }

  try {
    packageJson = require(path.join(themePath, 'package'));
  } catch(e) {
    // 'package' module does not exist
  }

  var render;
  try {
    render = require(path.join(themePath, packageJson.main || 'index')).render;
  } catch(e) {
    // The file does not exist.
  }

  if(render && typeof render === 'function') {
    try {
      var rendered = render(resumeJson);
      fs.writeFileSync(path.resolve(process.cwd(), fileName), rendered);

      return typeof rendered.then === 'function' // check if it's a promise
        ? rendered.then(callback.bind(null, fileName, ''), callback)
        : callback(null, fileName, '');
    } catch (e) {
      return callback(e);
    }
  } else {
    console.log(chalk.yellow('Could not run the render function from local theme.'));
    callback(null, fileName, format);
  }

};
