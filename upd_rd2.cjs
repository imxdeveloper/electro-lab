const fs = require('fs');
let c = fs.readFileSync('src/ui/MaskLabPanel.js', 'utf8');

const marker = '      // Build Dynamic Architecture Diagram matching the identified chip type';
const idx = c.indexOf(marker);
if (idx === -1) {
  console.log('FAIL: Could not find marker');
  process.exit(1);
}

// Find the closing </ul> + </div> + `).join(''); before this marker
const searchFrom = Math.max(0, idx - 500);
const beforeMarker = c.substring(searchFrom, idx);
const ulCloseIdx = beforeMarker.lastIndexOf('</ul>');
if (ulCloseIdx === -1) {
  console.log('FAIL: Could not find </ul> before marker');
  process.exit(1);
}

const absUlCloseIdx = searchFrom + ulCloseIdx;
const insertAfterIdx = absUlCloseIdx + '</ul>'.length;

const insertText = '\n          <div class="section-card-definition">\n            <p>${escapeHTML(g.definition || \\'\\')}</p>\n          </div>\n          <div class="section-card-layers">\n            ${g.layers.map((l) => `<span class="layer-pill" style="border-left-color: ${l.color};">${escapeHTML(l.name)} <small>(${l.shapes})</small></span>`).join(\'\') || \'<span class="layer-pill">Standard CMOS stack</span>\'}\n          </div>';

c = c.substring(0, insertAfterIdx) + insertText + c.substring(insertAfterIdx);
fs.writeFileSync('src/ui/MaskLabPanel.js', c);
console.log('SUCCESS: Added definition and layers sections');
