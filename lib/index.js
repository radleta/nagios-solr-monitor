#!/usr/bin/env node

'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment');
var numeral = require('numeral');
var Plugin = require('nagios-plugin');
var program = require('commander');

// create a new plugin object with optional initialization parameters
var appName = 'nagios-solr-monitor';
var o = new Plugin({
  // shortName is used in output
  shortName : 'solr'
});

// set up the program
program
  .version('1.0.0')
  //.option('-h, --host <host>', 'the host to check')
  .option('-v, --verbose', 'Outputs the verbose output for the program.')
  //.usage('[options]')
  .parse(process.argv);

// define the cores command
program
  .command('cores <host>')
  .description('checks the status and age of solr cores on a host')
  .option('-p, --port [n]', 'The port of the Solr web app.', Number)
  .option('-u, --url [url]', 'The url of the Solr web app end point to report on cores status in JSON. Defaults to /solr/admin/cores?wt=json.')
  .option('-r, --regex [regex]', 'The regex to use to match the core names. Defaults to empty meaning no filter. Must be a valid regex.', function (input) { return new RegExp(input, 'i'); })
  .option('--t, --time [time]', 'The time measure for the threasholds. Defaults to minutes. Input can be milliseconds, seconds, minutes, hours, days, or years.', /^(milliseconds|seconds|minutes|hours|days|years)$/i)
  .option('--age-warning [n]', 'The maximum age at which the cores becomes a WARNING.', Number)
  .option('--age-critical [n]', 'The maximum age at which the cores becomes a CRITICAL.', Number)
  .option('--docs-warning [n]', 'The minimum number of docs at which the cores becomes a WARNING.', Number)
  .option('--docs-critical [n]', 'The minimum number of docs at which the cores becomes a CRITICAL.', Number)
  .action(function(host, options) {
    
    // normalize inputs
    var time = options.time || 'minutes';
    var ageWarningSeconds = options.ageWarning ? moment.duration(options.ageWarning, time).asSeconds() : null;
    var ageCriticalSeconds = options.ageCritical ? moment.duration(options.ageCritical, time).asSeconds() : null;
    
    var requestBefore = new Date().getTime();
    request('http://' + host + (options.port ? ':' + options.port : '') + (options.url || '/solr/admin/cores?wt=json'), function (err, response, body) {
      var requestAfter = new Date().getTime();
      var requestTime = (requestAfter - requestBefore) / 1000;
      
      if (err) {
        o.nagiosExit(o.states.CRITICAL, err);
        return;
      } else if (response.statusCode !== 200) {
        o.nagiosExit(o.states.CRITICAL, 'Unexpected status code. HTTP ' + response.statusCode + ' returned.');
        return;
      }
      
      // fetch solr cores data
      var solrCores = JSON.parse(body);
      
      // ensure we have a green status
      var solrStatus = _.get(solrCores, 'responseHeader.status');
      if (solrStatus !== 0) {
        o.addMessage(o.states.CRITICAL, 'Unexpected solr status. Solr status ' + solrStatus + ' return.');
      }
      
      // parse the cores
      var solrCoresStatus = _.get(solrCores, 'status');
      if (solrCoresStatus) {
        
        var maxAgeSeconds = 0;
        var maxAgeMoment;
        var minDocs;
        for (var n in solrCoresStatus) {
          var core = solrCoresStatus[n];
          
          // filter cores by name using regex when provided
          if (options.regex && !options.regex.test(core.name)) {
            continue;
          }
          
          // ensure the number of documents matches expected
          var numDocs = _.get(core, 'index.numDocs');
          if (numDocs || numDocs === 0) {
            minDocs = !minDocs && minDocs !== 0 ? numDocs : Math.min(minDocs, numDocs);
            if ((options.docsCritical || options.docsCritical === 0) && options.docsCritical >= numDocs) {
              o.addMessage(o.states.CRITICAL, 'Solr core ' + core.name + ' has ' + numDocs + ' docs.');
            } else if ((options.docsWarning || options.docsWarning === 0) && options.docsWarning >= numDocs) {
              o.addMessage(o.states.WARNING, 'Solr core ' + core.name + ' has ' + numeral(numDocs).format('0,0') + ' docs.');
            }
            o.addPerfData({
              label: core.name + '.numDocs',
              value: numDocs,
              uom: '',
              min: 0,
            });
          } else {
            o.addMessage(o.states.CRITICAL, 'Unexpected solr response. Document count was not found. Core: ' + core.name);
          }
          
          // ensure the age of the index matches expected
          var lastModified = _.get(core, 'index.lastModified');
          if (lastModified) {
            var lastModifiedMoment = moment(lastModified);
            var ageSeconds = moment(new Date()).diff(lastModifiedMoment, 'seconds');
            if (ageSeconds >= maxAgeSeconds) {
              maxAgeMoment = lastModifiedMoment
              maxAgeSeconds = ageSeconds;
            }
            if (ageCriticalSeconds && ageCriticalSeconds <= ageSeconds) {
              o.addMessage(o.states.CRITICAL, 'Solr core ' + core.name + ' is ' + lastModifiedMoment.fromNow() + ' old.');
            } else if (ageWarningSeconds && ageWarningSeconds <= ageSeconds) {
              o.addMessage(o.states.WARNING, 'Solr core ' + core.name + ' is ' + lastModifiedMoment.fromNow() + ' old.');
            }
            o.addPerfData({
              label: core.name + '.age',
              value: moment.duration(ageSeconds, 'seconds').get(time),
              uom: time == 'seconds' ? 's' : '',
              min: 0,
            });
          } else {
            o.addMessage(o.states.CRITICAL, 'Unexpected solr response. Last modified date was not found. Core: ' + core.name);
          }
        }
        
        if (maxAgeMoment) {
          o.addMessage(o.states.OK, 'Oldest core is ' + maxAgeMoment.fromNow() + ' old. Smallest core has ' + numeral(minDocs).format('0,0') + ' docs. Request completed in ' + requestTime + ' seconds.');  
        } else {
          o.addMessage(o.states.CRITICAL, 'No cores found.');
        }                
        
      } else {
        o.addMessage(o.states.CRITICAL, 'Unexpected solr response. No status returned.');
      }
      
      var messageObj = o.checkMessages();
      o.nagiosExit(messageObj.state, messageObj.message);
      
    });
    
  });
  
program.parse(process.argv);

if (!process.argv || (process.argv[0] === 'node' && process.argv.length <= 2)) {
  program.outputHelp();
}