var themeServer = process.env.THEME_SERVER || 'http://themes.jsonresume.org/theme/';
var registryServer = process.env.REGISTRY_SERVER || 'http://registry.jsonresume.org';
var request = require('superagent');
var http = require('http');
var fs = require('fs');
var path = require('path');
var read = require('read');
var spinner = require("char-spinner");
var chalk = require('chalk');
var pdf = require('html-pdf');

var SUPPORTED_FILE_FORMATS = ["html", "pdf"];

module.exports = function exportResume(resumeJson, fileName, program, callback) {
  var theme = program.theme;
  if(!theme.match('jsonresume-theme-.*')){
    theme = 'jsonresume-theme-' + theme;
  }

  if (!fileName) {
    console.error("Please enter a export destination.");
    process.exit(1);
  }

  var fileNameAndFormat = getFileNameAndFormat(fileName, program.format);
  var originalFileName = fileName;
  fileName = fileNameAndFormat.fileName;
  var fileFormatToUse = fileNameAndFormat.fileFormatToUse;
  var format = "." + fileFormatToUse;

  if (theme.match('/')) {
    // Assume local theme
    exportFromLocal(resumeJson, originalFileName, theme, callback);
  }

  else if (format === '.html') {
    sendExportRequest(resumeJson, fileName, theme, format, function() {
      callback(null, fileName, format);
    });
  }
  else if (format === '.pdf') {
    sendExportPDFRequest(resumeJson, fileName, theme, format, function() {
        callback(null, fileName, format);
    });
  }

  else {
    console.error(`JSON Resume does not support the ${format} format`);
    process.exit(1);
  }
}

function extractFileFormat(fileName) {
  var dotPos = fileName.lastIndexOf('.');
  if (dotPos === -1) {
    return null;
  }
  return fileName.substring(dotPos + 1).toLowerCase();
}

function createHtml(resumeJson, fileName, theme, format, callback) {
  var html = renderHtml(resumeJson, theme);
  var stream = fs.createWriteStream(path.resolve(process.cwd(), fileName + format));

  stream.write(html, function() {
    stream.close(callback);
  });

}

function renderHtml(resumeJson, theme){
  var themePkg = require(theme);
  return themePkg.render(resumeJson);
}

function createPdf(resumeJson, fileName, theme, format, callback) {
    var html = renderHtml(resumeJson, theme);
    pdf.create(html, {format: 'Letter'}).toFile(fileName + format, callback);
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
