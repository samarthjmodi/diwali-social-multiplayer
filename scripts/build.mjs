import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../public/',import.meta.url);
let html=await readFile(new URL('index.html',root),'utf8');
const css=await readFile(new URL('style.css',root),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+css+'</style>');
for(const file of ['cards.js','core.js','app.js']){const js=await readFile(new URL(file,root),'utf8');html=html.replace(`<script defer src="${file}"></script>`,'');html=html.replace('</body>',()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script></body>');}
await writeFile(new URL('diwali-party.html',root),html);
console.log('Built public/diwali-party.html');
