const fs=require('fs'),vm=require('vm');
let s=fs.readFileSync('C:/Users/alknd/Desktop/code_artifact.html','utf8');
s=s.replace(/        import .* from .*;\r?\n/g,'');
const start=s.indexOf('                    await setDoc(stateRef, cleanData);');
const end=s.indexOf('        async function initDatabase()',start);
if(start<0||end<0)throw Error('Missing repair target');
s=s.slice(0,start)+`        window.saveDatabase = function() { try { localStorage.setItem('quran_competition_state_v3', JSON.stringify(window.appState)); } catch(e) { window.showModal('تعذر الحفظ المحلي، يرجى تصدير نسخة احتياطية.'); } };\n\n`+s.slice(end);
s=s.replace(/Array\.isArray\(window\.appState\.participants\) && window\.appState\.participants\.length > 0/g,'Array.isArray(window.appState.participants)');
let count=0;
for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(m[1].includes('src='))continue;new vm.Script(m[2]);count++;}
fs.writeFileSync(__dirname+'/quran-manager/dist/index.html',s);
console.log('Validated inline scripts: '+count);
