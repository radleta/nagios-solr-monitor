# nagios-solr-monitor

This is a plugin for Nagios that will parse the cores status of a Solr web app. It is written in Node.js.

## Features

* Ability to monitor multiple cores within solr
* Ability to check the age of core
* Ability to check the number of docs in a core
* Outputs the age and docs as performance counter data for each core monitored

## Usage

```
  Usage: cores [options] <host>

  checks the status and age of solr cores on a host

  Options:

    -h, --help           output usage information
    -p, --port [n]       The port of the Solr web app.
    -u, --url [url]      The url of the Solr web app end point to report on cores status in JSON. Defaults to /solr/admin/cores?wt=json.
    -r, --regex [regex]  The regex to use to match the core names. Defaults to empty meaning no filter. Must be a valid regex.
    --t, --time [time]   The time measure for the threasholds. Defaults to minutes. Input can be milliseconds, seconds, minutes, hours, days, or years.
    --age-warning [n]    The maximum age at which the cores becomes a WARNING.
    --age-critical [n]   The maximum age at which the cores becomes a CRITICAL.
    --docs-warning [n]   The minimum number of docs at which the cores becomes a WARNING.
    --docs-critical [n]  The minimum number of docs at which the cores becomes a CRITICAL.
```

## Getting Started

### Install

```
git clone https://github.com/radleta/nagios-solr-monitor.git /opt/nagios-solr-monitor
cd /opt/nagios-solr-monitor
npm install
```

## Implementation

### Simple example of the command and service
```
define command {
  command_name  check_solr_cores
  command_line  node /opt/nagios-solr-monitor/lib/index.js cores $HOSTADDRESS$ $ARG1$
}
define service {
  service_description check_solr_cores
  check_command       check_solr_cores!--age-warning 30 --age-critical 60 --time minutes --docs-critical 0
}
```