const fs = require('fs');
const esprima = require('esprima');


const start = Date.now()
const code = fs.readFileSync('/Users/ubaidmanzoor/Development/work/blkbox/storyboards/models/storyboard.ts', 'utf-8');
const ast = esprima.parseScript(code, { loc: true });
const end = Date.now()

console.log(end - start)