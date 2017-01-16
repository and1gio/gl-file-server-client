function Manager(config) {
    var scope = this;

    var http = require('http');
    var request = require('request');
    var fs = require("fs");

    request.debug = false;

    this.config = config;
    this.resolutions = {};
    this.supportedCrops = {
        "TL": true,
        "TC": true,
        "TR": true,
        "ML": true,
        "MC": true,
        "MR": true,
        "BL": true,
        "BC": true,
        "BR": true
    };

    /**
     * Public Methods
     */
    this.saveStream = function (stream, key, metadata, cb) {
        var callback = cb;
        var keyword = key || scope.config.key;

        var params = {
            file: stream
        };

        if (metadata.originalName) {
            params.originalName = new Buffer(metadata.originalName).toString('base64');
        }

        if (metadata.mimeType) {
            params.mimeType = metadata.mimeType;
        }

        if (metadata.encoding) {
            params.encoding = metadata.encoding;
        }

        if (metadata.size) {
            params.size = metadata.size;
        }

        if (keyword) {
            params.key = keyword;
        }

        postFormData("file/save", params, function (err, res) {
            return callback(err, res);
        });
    };

    this.saveFile = function (file, key, cb) {
        var callback = cb;
        var keyword = key || scope.config.key;

        var stream = fs.createReadStream(file.path);

        var params = {
            file: stream
        };

        if (file.originalname) {
            params.originalName = new Buffer(file.originalname).toString('base64');
        }

        if (file.mimetype) {
            params.mimeType = file.mimetype;
        }

        if (file.encoding) {
            params.encoding = file.encoding;
        }

        if (file.size) {
            params.size = file.size;
        }

        if (keyword) {
            params.key = keyword;
        }

        postFormData("file/save", params, function (err, res) {
            return callback(err, res);
        });

        fs.unlinkSync(file.path);
    };

    this.getFile = function (fileConf, cb) {
        var params = {};

        if (typeof fileConf === "string") {
            params.fileId = fileConf;
            params.key = scope.config.key;
        } else {
            params.fileId = fileConf.fileId;
            params.key = fileConf.key || scope.config.key;
        }

        getFileStream("file/get", params, function (err, res) {
            if(err){
                return cb([{keyword: 'FAILED_TO_GET_FILE_FROM_STORAGE'}], null);
            }
            res.metaData.originalName = (new Buffer(res.metaData.originalName, "base64")).toString();
            return cb(null, {stream: res.stream, metaData: res.metaData});
        });
    };

    this.getImage = function (fileConf, options, cb) {
        var params = {};

        if (typeof fileConf === "string") {
            params.fileId = fileConf;
            params.key = scope.config.key;
        } else {
            params.fileId = fileConf.fileId;
            params.key = fileConf.key || scope.config.key;
        }

        if ((options.width || options.height) && !scope.isResolutionPermitted(options.width, options.height)) {
            return cb([{keyword: 'RESOLUTION_NOT_PERMITTED'}], null);
        }

        if (options.crop && !scope.supportedCrops[options.crop]) {
            return cb([{keyword: 'UNSUPPORTED_CROP_PLACEMENT'}], null);
        }

        for (var i in options) {
            params[i] = options[i];
        }

        getFileStream("file/get/image", params, function (err, res) {
            return cb(err, res);
        });
    };

    this.getFileMeta = function(fileId, key, cb) {
        postJSON("file/get/meta", {fileId: fileId, key: key}, function (err, metaData) {

            if(err){
                return cb([{keyword: 'FAILED_TO_GET_FILE_META'}], null);
            }
            return cb(null, metaData);
        });
    };

    this.addPermittedResolution = function (width, height) {
        if (!width) {
            width = 0;
        }
        if (!height) {
            height = 0;
        }
        if (!scope.resolutions[width]) {
            scope.resolutions[width] = {};
        }
        scope.resolutions[width][height] = true;
    };

    this.isResolutionPermitted = function (width, height) {
        if (!width) {
            width = 0;
        }

        if (!height) {
            height = 0;
        }

        if (!scope.resolutions[width]) {
            return false;
        }

        if (!scope.resolutions[width][height]) {
            return false;
        }

        return true;
    };

    /**
     * Private Methods
     */
    function getFileStream(method, data, cb) {
        var conf = scope.config;
        var postData = JSON.stringify(data);
        var options = {
            hostname: conf.host,
            port: conf.port,
            path: conf.path + method,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        var req = http.request(options, function (res) {
            if (res.statusCode !== 200) {
                var data = "";
                res.on('data', function (chunk) {
                    data += chunk;
                });
                res.on('end', function () {
                    cb(JSON.parse(data).error, null);
                });
                return;
            }
            cb(null, {
                stream: res,
                metaData: {
                    originalName: res.headers["original-name"],
                    contentType: res.headers["content-type"]
                }
            });
        });

        req.on('error', function (e) {
            cb([{keyword: 'CONNECTION_ERROR', error: e}], null);
        });
        req.write(postData);
        req.end();
    }

    function postFormData(method, data, cb) {
        var conf = scope.config;
        var apiUrl = "http://" + conf.host + ":" + conf.port + conf.path + method;

        var reqObj = {url: apiUrl, formData: data};
        request.post(reqObj, function (error, response, body) {
            handleResponse__formData(error, response, body, cb);
        });
    }

    function postJSON(method, data, cb) {
        var conf = scope.config;
        var apiUrl = "http://" + conf.host + ":" + conf.port + conf.path + method;

        var reqObj = {url: apiUrl, json: data};
        request.post(reqObj, function (error, response, body) {
            handleResponse__JSON(error, response, body, cb);
        });
    }

    function handleResponse__formData(fnError, response, body, callback) {
        if (fnError) {
            return callback([{keyword: 'CONNECTION_ERROR', error: fnError}], null);
        }

        var respBody = JSON.parse(body);

        if (!respBody || !respBody.result) {
            return callback([{keyword: 'CONNECTION_ERROR', error: {message: "response body is null"}}], null);
        }

        if (respBody.result.error) {
            return callback(respBody.result.error, null);
        }

        callback(null, respBody.result.data);
    }

    function handleResponse__JSON(fnError, response, body, callback) {
        if (fnError) {
            return callback([{keyword: 'CONNECTION_ERROR', error: fnError}], null);
        }

        var respBody = body;

        if (!respBody || !respBody.result) {
            return callback([{keyword: 'CONNECTION_ERROR', error: {message: "response body is null"}}], null);
        }

        if (respBody.result.error) {
            return callback(respBody.result.error, null);
        }

        callback(null, respBody.result.data);
    }

}

module.exports = Manager;