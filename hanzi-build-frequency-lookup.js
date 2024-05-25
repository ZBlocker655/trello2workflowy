/*
This script loads the HTML file hanzi-frequency.html (sourced from https://hanzicraft.com/lists/frequency) 
and outputs a JSON file with Hanzi frequency data.

The data in the HTML file is located inside an <ol> found in the following path: /html/body/div.container/div.row/div.frequency-list/ol.
Within the <ol> each list element needs to be parsed to extract the Hanzi character and its frequency.

Here is a typical element:
<li class="list">
    <a href="/character/的" target="_blank">的</a>
    <span>1</span>
</li>

Build a data class from this element { hanzi: '{{text of <a> link}}', frequency: '{{text of <span>}}' } and store it in an array, 
where the index of the array corresponds to the frequency of the Hanzi character. 
NOTE: this means that element 0 of the array should be blank because the frequency list starts at 1.

Save the output to hanzi-frequency.json (formatted with indenting) in the same folder as hanzi-frequency.html.
*/

const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('data/hanzi-frequency.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

console.log('Parsed hanzi-frequency.html');

const frequencyList = document.querySelector('ol').children;
const frequencyData = [];

for (let i = 0; i < frequencyList.length; i++) {
    const hanzi = frequencyList[i].querySelector('a').textContent;
    const frequency = frequencyList[i].querySelector('span').textContent;

    // For debugging purposes, log the first few hanzi and frequencies.
    if (i < 5) {
        console.log('Hanzi: ' + hanzi + ', Frequency: ' + frequency);
    }

    // Validate that hanzi is non-empty and that frequency is a positive integer.
    if (hanzi === '' || isNaN(frequency) || frequency < 1) {
        console.error('Invalid data found at index ' + i);
        continue;
    }

    // Validate that the frequency == i + 1. If not, stop execution.
    if (frequency != i + 1) {
        console.error('Frequency mismatch at index ' + i + ': ' + frequency + ' != ' + (i + 1));
        break;
    }

    frequencyData[i+1] = {hanzi,frequency};

    // Log every 1000th entry to track progress.
    if (i % 1000 === 0 && i > 0) {
        console.log('Parsed ' + i + ' entries');
    }
}

// Final statement of how many entries were parsed.
console.log('Parsed ' + frequencyList.length + ' entries');

fs.writeFileSync('data/hanzi-frequency.json', JSON.stringify(frequencyData, null, 4));
console.log('Hanzi frequency data saved to data/hanzi-frequency.json');
