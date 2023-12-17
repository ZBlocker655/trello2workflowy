/*
OVERVIEW: Load HTML file data/import_mammoth_bundle.html and extract the courses from the HTML.

HOW TO FIND COURSES IN THE HTML:
Each course is in an element <div class="course-listing">...</div>. The relative URL is found in attribute data-course-url.
The title of the course is the text inside the <div class="course-listing-title">...</div>.
*/

const urlBase = "https://training.mammothinteractive.com/";

const fs = require('fs');
const path = require('path');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { window } = new JSDOM();
const $ = require('jquery')(window);

const html = fs.readFileSync(path.resolve(__dirname, 'data/mammoth_bundle.html'), 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

// Log to console some info to verify that HTML doc is correctly loaded and contains elements.
console.log(`Title: ${document.querySelector('title').textContent}`);

const courseListings = document.querySelectorAll('.course-listing');
console.log(`Found ${courseListings.length} courses.`);
const courses = [];
courseListings.forEach(courseListing => {
    var title = courseListing.querySelector('.course-listing-title').textContent.replace(/\n/g, '');
    const course = {
        title: title,
        url: urlBase + courseListing.getAttribute('data-course-url')
    };
    courses.push(course);
});

var opml = `<?xml version="1.0"?>
<html>
  <body>
    <ul>
      `;

courses.forEach(course => {
    opml += `      <li><a href="${course.url}">${course.title}</a> | #📝 </li>
`;
});

opml += `    </ul>
  </body>
</html>
`;

fs.writeFileSync(path.resolve(__dirname, 'data/import_mammoth_bundle.html'), opml, 'utf8');
console.log('Done!');
