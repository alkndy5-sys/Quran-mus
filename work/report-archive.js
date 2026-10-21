(() => {
    const KEY = 'quran_report_archive_v1';
    let trash = [];
    const dbReady = new Promise((resolve,reject)=>{
        const request=indexedDB.open(window.quranCompetitionDatabase||'quran_report_data',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('records');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const database=window.quranCompetitionDatabase||'quran_report_data';
    const secureReady=dbReady.then(db=>window.quranCrypto.migrate(database,db));
    const storage = async (key,value) => {
        const db=await dbReady;await secureReady;
        const encoded=value===undefined?undefined:await window.quranCrypto.encode(database,key,value);
        const result=await new Promise((resolve,reject)=>{const tx=db.transaction('records',value===undefined?'readonly':'readwrite'),store=tx.objectStore('records'),r=value===undefined?store.get(key):store.put(encoded,key);let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('أُلغي الحفظ'));});
        return value===undefined?window.quranCrypto.decode(database,key,result):result;
    };
    window.quranArchiveStorage=storage;
    const persistReports = next => storage(KEY, clone(next));
    async function commitArchive(next, removed) {
        const db=await dbReady;await secureReady;const encodedNext=await window.quranCrypto.encode(database,KEY,clone(next)),encodedTrash=await window.quranCrypto.encode(database,KEY+'_trash',clone(removed));
        await new Promise((resolve,reject)=>{
            const tx=db.transaction('records','readwrite');
            tx.objectStore('records').put(encodedNext,KEY);
            tx.objectStore('records').put(encodedTrash,KEY+'_trash');
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
        });
        reports=next;trash=removed;list();
    }
    function manageArchives() {
        el('archive-manager-modal')?.remove();
        const overlay=document.createElement('div');overlay.id='archive-manager-modal';
        overlay.className='fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4';
        const box=document.createElement('div');box.className='bg-white p-6 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-3';
        box.setAttribute('role','dialog');box.setAttribute('aria-label','إدارة المحفوظات');box.setAttribute('aria-modal','true');
        overlay.appendChild(box);document.body.appendChild(overlay);
        let deleted=false;
        function draw() {
            box.replaceChildren();
            const heading=document.createElement('h3');heading.className='font-bold text-brand-darkGreen';heading.textContent=deleted?'المحذوفات — تحديد نسخ لاستعادتها':'المحفوظات — تحديد نسخ لحذفها';box.appendChild(heading);
            const info=document.createElement('p');info.className='text-xs text-gray-600';info.textContent='هذه النسخ محفوظة داخل المتصفح. ملفات جهازك لا تتأثر.';box.appendChild(info);
            const tools=document.createElement('div');tools.className='flex flex-wrap gap-2';box.appendChild(tools);
            const button=(title,action)=>{const b=document.createElement('button');b.type='button';b.className='px-3 py-2 bg-gray-100 rounded-lg text-xs font-bold';b.textContent=title;b.onclick=action;tools.appendChild(b);return b;};
            button(deleted?'عرض المحفوظات':'عرض المحذوفات ('+trash.length+')',()=>{deleted=!deleted;draw();});
            const checks=[];
            button('تحديد الكل',()=>checks.forEach(c=>c.checked=true));button('إلغاء التحديد',()=>checks.forEach(c=>c.checked=false));
            const entries=document.createElement('div');entries.className='space-y-2 max-h-60 overflow-y-auto';box.appendChild(entries);
            const source=deleted?trash:reports;
            if(!source.length){const empty=document.createElement('p');empty.textContent='لا توجد نسخ في هذه القائمة';entries.appendChild(empty);}
            [...source].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).forEach(item=>{
                const row=document.createElement('label');row.className='flex items-center gap-3 border rounded-lg p-3 text-xs cursor-pointer';
                const check=document.createElement('input');check.type='checkbox';check.value=item.id;checks.push(check);row.appendChild(check);
                const text=document.createElement('span');text.textContent=item.name+' — '+window.reportSaveTime(item.updatedAt).replace(/(\d{2})-(\d{2})-(\d{2})$/,'$1:$2:$3')+' — '+item.id.slice(-8);row.appendChild(text);entries.appendChild(row);
            });
            const message=document.createElement('p');message.className='text-xs';message.setAttribute('role','status');box.appendChild(message);
            const apply=button(deleted?'استعادة المحدد':'حذف المحدد',async()=>{
                const ids=new Set(checks.filter(c=>c.checked).map(c=>c.value));
                if(!ids.size){message.textContent='حدد نسخة واحدة على الأقل.';return;}
                apply.disabled=true;clearTimeout(timer);
                try {
                    await writeQueue;
                    if(deleted){
                        const restored=trash.filter(r=>ids.has(r.id));
                        await commitArchive(reports.concat(restored.filter(r=>!reports.some(x=>x.id===r.id))),trash.filter(r=>!ids.has(r.id)));
                    }else{
                        await commitArchive(reports.filter(r=>!ids.has(r.id)),trash.concat(reports.filter(r=>ids.has(r.id))));
                        if(ids.has(activeId)){activeId=null;suppressSave=true;list();}
                    }
                    draw();
                }catch(e){message.textContent='تعذر تنفيذ العملية: '+e.message;apply.disabled=false;}
            });
            button('إغلاق',()=>overlay.remove());
        }
        draw();
    }
    let reports = [], activeId = null, ready = false, restoring = false, timer, folder = null;
    let writeQueue = Promise.resolve();
    let suppressSave = false;
    const folderStore = async (handle) => {
        const db = await new Promise((resolve,reject) => {
            const request = indexedDB.open(window.quranCompetition==='local'?'quran_archive_folder_local':'quran_archive_folder',1);
            request.onupgradeneeded = () => request.result.createObjectStore('handles');
            request.onsuccess = () => resolve(request.result); request.onerror=()=>reject(request.error);
        });
        try { return await new Promise((resolve,reject) => {
            const tx=db.transaction('handles',handle?'readwrite':'readonly');
            const request=handle?tx.objectStore('handles').put(handle,'folder'):tx.objectStore('handles').get('folder');
            let result; request.onsuccess=()=>result=request.result;
            tx.oncomplete=()=>resolve(result); tx.onerror=()=>reject(tx.error);
        }); } finally { db.close(); }
    };
    const el = id => document.getElementById(id);
    const clone = value => JSON.parse(JSON.stringify(value));
    const status = text => { ['archive-status','report-folder-status'].forEach(id=>{if(el(id))el(id).textContent=text;}); };
    const safe = text => String(text || '').trim().replace(/[\\/:*?"<>|\x00-\x1F]/g, '-');
    const name = data => ['جدول استماع', data.day, data.date, data.period, data.gender].map(safe).filter(Boolean).join(' - ');
    const uniqueId = () => 'نسخة-' + Date.now() + '-' + Math.random().toString(36).slice(2,10);
    const fileName = item => safe(item.name).slice(0,120)+' - حفظ '+window.reportSaveTime(item.updatedAt).split(' ')[1]+' - '+safe(item.id)+'.json';
    async function readFolder() {
        if (!folder || typeof folder.values !== 'function')return;
        let added=0, skipped=0;
        const scan = async (directory, prefix='') => {
            for await (const handle of directory.values()) {
                if(handle.kind==='directory') { if(handle.name==='نسخ الجداول')await scan(handle,prefix+handle.name+'/'); continue; }
                if(!handle.name.toLowerCase().endsWith('.json'))continue;
                try {
                    const file=await handle.getFile(), raw=JSON.parse(await file.text());
                    if(!Array.isArray(raw.participants))continue;
                    const source=prefix+handle.name;
                    if(trash.some(r=>r.sourceFile===source || (raw.archiveId===r.id && raw.updatedAt===r.updatedAt)))continue;
                    if(reports.some(r=>r.sourceFile===source || (raw.archiveId===r.id && raw.updatedAt===r.updatedAt))) {
                        const existing=reports.find(r=>raw.archiveId===r.id && raw.updatedAt===r.updatedAt);
                        if(existing)existing.sourceFile=source;
                        continue;
                    }
                    const date=raw.updatedAt || raw.savedAt || new Date(file.lastModified).toISOString();
                    reports.push({id:uniqueId(),name:raw.archiveName || name(raw),createdAt:raw.createdAt||date,updatedAt:date,data:raw,sourceFile:source}); added++;
                }catch(e){skipped++;}
            }
        };
        await scan(folder); await persistReports(reports); list();
        status('تم تحديث القائمة؛ أُضيفت '+added+' نسخة'+(skipped?'، تعذرت قراءة '+skipped+' ملفات':''));
    }
    async function removeSelected() {
        const id=el('archive-list').value, item=reports.find(r=>r.id===id);
        if(!item)return window.showModal('اختر النسخة المراد حذفها من القائمة.');
        window.showModal('حذف النسخة المحددة من حفظ المتصفح؟ ستُزال من القائمة، وتبقى نسخة استعادة داخل المتصفح. ملفات الجهاز لا تتأثر.',true,async()=>{
            try {
                clearTimeout(timer);
                const removed=trash.concat(item);await storage(KEY+'_trash',removed);trash=removed;
                const next=reports.filter(r=>r.id!==id);await persistReports(next);reports=next;
                if(activeId===id){activeId=null; suppressSave=true;}
                list();status('تم حذف النسخة المحددة من قائمة المحفوظات في المتصفح.');
            }catch(error){status('تعذر الحذف: '+error.message);}
        });
    }
    function snapshot() {
        const controls = {};
        document.querySelectorAll('#tab-reports input[id], #tab-reports select[id], #tab-reports textarea[id]').forEach(node => {
            if (node.type !== 'file' && !node.id.startsWith('archive-')) controls[node.id] = {value: node.value, checked: node.checked};
        });
        const read = (key, input) => el('preview-report-' + key)?.innerText || el(input)?.value || '';
        const ids = window.appState.reportCustomList || [];
        return clone({title: read('title', 'report-title-input'), day: read('day', 'report-day-select'), date: read('date', 'report-date-input'), period: read('period', 'report-period-select'), gender: read('gender', 'report-gender-select'), participants: ids.map(id => window.appState.participants.find(p => String(p.id) === String(id))).filter(Boolean), selectedColumns: window.appState.reportSelectedCols, controls, reportSettings: Object.fromEntries(Object.entries(window.appState.settings || {}).filter(([key]) => key.startsWith('report')))});
    }
    function list() {
        const select = el('archive-list');
        if (!select) return;
        select.replaceChildren(new Option('اختر جدولاً محفوظاً للتعديل', ''));
        [...reports].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).forEach(item => select.add(new Option(item.name + ' — نسخة: ' + window.reportSaveTime(item.updatedAt).replace(/(\d{2})-(\d{2})-(\d{2})$/, '$1:$2:$3') + ' — ' + item.id.slice(-8), item.id)));
        select.value = activeId || '';
    }
    function writeFile(item) {
        const target = folder;
        if (!target) return Promise.resolve(false);
        const data = clone(item);
        const task = async () => { try {
            const versions = target;
            if(data.sourceFile)return true;
            const filename = fileName(data);
            const handle = await versions.getFileHandle(filename, {create: true});
            const writer = await handle.createWritable();
            await writer.write(JSON.stringify({...data.data, archiveId: data.id, archiveName: data.name, updatedAt: data.updatedAt, savedAtSaudi: window.reportSaveTime(data.updatedAt), timeZone: 'Asia/Riyadh'}, null, 2));
            await writer.close();
            const verified = JSON.parse(await (await handle.getFile()).text());
            if (verified.archiveId !== data.id || verified.updatedAt !== data.updatedAt) throw new Error('التحقق من الملف لم ينجح');
            return true;
        } catch(e) { status('لم يُحفظ ملف JSON في المجلد: '+target.name+' — '+(e.name || 'خطأ')+'؛ '+(e.message || 'تحقق من إذن الكتابة')+' — البيانات محفوظة في المتصفح.'); return false; } };
        const result = writeQueue.then(task); writeQueue=result.catch(()=>{}); return result;
    }
    async function syncAll(permissionGranted = false) {
        // Request access while the click's user activation is still available.
        const permission = permissionGranted === true ? Promise.resolve('granted')
            : folder && typeof folder.requestPermission === 'function' ? folder.requestPermission({mode:'readwrite'}) : Promise.resolve('granted');
        save();
        if (!folder) return pickFolder();
        try {
            if (await permission !== 'granted') {
                status('لم يُمنح إذن المجلد؛ يستمر الحفظ داخل المتصفح'); return;
            }
            await readFolder();
            let count=0;
            for(const item of [...reports]) if(await writeFile(item))count++;
            status(count===reports.length ? 'تم حفظ جميع الجداول ('+count+') في المجلد: '+folder.name+' — تُحفظ التعديلات كنسخ مستقلة' : 'تم حفظ '+count+' من '+reports.length+'؛ أعد المحاولة لحفظ البقية');
        } catch(e) { status('تعذر الوصول للمجلد؛ اضغط اختيار مجلد لإعادة ربطه'); }
    }
    function save() {
        if (!ready || restoring || suppressSave) return;
        clearTimeout(timer);
        const data = snapshot();
        if (!activeId && !data.participants.length) return;
        const previous = reports.find(item => item.id === activeId);
        if (previous && JSON.stringify(previous.data) === JSON.stringify(data)) return;
        const timestamp = new Date().toISOString();
        const id = uniqueId();
        const item = {id, name: name(data), createdAt: previous?.createdAt || previous?.updatedAt || timestamp, updatedAt: timestamp, data};
        const next = reports.concat(item);
        void persistReports(next).catch(e=>status('تعذر حفظ الأرشيف: '+e.message+'؛ نزّل نسخة JSON للاحتفاظ بالبيانات.'));
        reports = next; activeId = id; list(); status('تم الحفظ التلقائي — ' + new Date().toLocaleTimeString('ar-SA')); void writeFile(item).then(ok=>{if(ok)status('حُفظت نسخة JSON تلقائياً في: '+folder.name);});
    }
    const schedule = () => { if (ready && !restoring && !suppressSave) { clearTimeout(timer); timer = setTimeout(save, 600); } };
    function open() {
        const id = el('archive-list').value;
        save();
        const item = reports.find(r => r.id === id);
        if (!item) return;
        restoring = true;
        try {
            const data = clone(item.data);
            data.participants.forEach(p => {
                const existing = window.appState.participants.find(x => String(x.id) === String(p.id));
                if (existing) Object.assign(existing, p); else window.appState.participants.push(p);
            });
            window.appState.reportCustomList = data.participants.map(p => String(p.id));
            if (data.selectedColumns) window.appState.reportSelectedCols = data.selectedColumns;
            Object.assign(window.appState.settings, data.reportSettings || {});
            window.renderAll();
            Object.entries(data.controls || {}).forEach(([id,state]) => { const node=el(id); if(node){node.value=state.value; if(typeof state.checked==='boolean')node.checked=state.checked;} });
            [['title','report-title-input'],['day','report-day-select'],['date','report-date-input'],['period','report-period-select'],['gender','report-gender-select']].forEach(([key,id]) => { if(el(id)) { if(el(id).tagName==='SELECT' && !Array.from(el(id).options).some(o=>o.value===data[key]))el(id).add(new Option(data[key],data[key])); el(id).value=data[key] || ''; } });
            window.updateReportPreview();
            window.updateReportMargin();
            window.saveDatabase();
            activeId = item.id; suppressSave=false; list(); status('تم فتح الجدول — تُحفظ التعديلات تلقائياً');
        } finally { restoring = false; }
    }
    async function importFile(event) {
        const input=event.target, file=input.files?.[0];
        if(!file)return;
        try {
            const fileText=(await file.text()).replace(/^\uFEFF/,'').trim();
            if(/^<!doctype\s+html|^<html/i.test(fileText))throw Error('هذا الملف صفحة HTML وليس بيانات JSON. أعد تنزيل الجدول من زر تنزيل الجدول المفتوح JSON، ولا تستخدم حفظ الصفحة في المتصفح.');
            const raw=JSON.parse(fileText);
            const data=raw.data && Array.isArray(raw.data.participants) ? raw.data : raw;
            if(!data || !Array.isArray(data.participants) || data.participants.some(p=>!p || typeof p!=='object' || Array.isArray(p) || typeof p.name!=='string'))throw Error('الملف يجب أن يحتوي على بيانات جدول وقائمة متسابقين صحيحة.');
            const ids=new Set();
            const participants=data.participants.map(p=>{
                const id=String(p.id ?? uniqueId());
                if(ids.has(id))throw Error('يوجد معرّف متسابق مكرر في الملف.');
                ids.add(id);return {...p,id};
            });
            save();
            const now=new Date().toISOString();
            const imported={...data,participants,title:data.title||'جدول استماع',day:data.day||'',date:data.date||'',period:data.period||'',gender:data.gender||'الجميع',controls:data.controls||{},reportSettings:data.reportSettings||{}};
            const item={id:uniqueId(),name:name(imported),createdAt:now,updatedAt:now,data:clone(imported)};
            const next=reports.concat(item);
            await persistReports(next);reports=next;list();
            el('archive-list').value=item.id;open();
            void writeFile(item);
            status('تم استيراد «'+file.name+'» وفتحه للتعديل؛ تُحفظ التعديلات تلقائياً.');
        }catch(e){window.showModal('تعذر استيراد JSON: '+e.message);}
        finally{input.value='';}
    }
    function fresh() {
        save(); activeId = null; suppressSave=false; restoring = true;
        window.appState.reportCustomList = []; window.renderReportTable(); window.saveDatabase();
        restoring = false; list(); status('جدول جديد — أضف المتسابقين ليُحفظ تلقائياً');
    }
    function download(event) {
        event?.preventDefault();
        const current=snapshot(), now=new Date().toISOString();
        const item={id:uniqueId(),name:name(current),updatedAt:now,data:current};
        const text = JSON.stringify({...current, savedAt:now, savedAtSaudi:window.reportSaveTime(now), timeZone:'Asia/Riyadh'}, null, 2);
        const filename = window.exportFileName(name(current),'json');
        // The explicit attachment type prevents browsers from treating JSON as a page.
        const blob = new Blob([text], {type:'application/json;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href=url; a.download=filename.replace(/(?:\.json)+$/i,'')+'.json'; a.style.display='none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
        save();
        status('تم طلب تنزيل ملف بيانات JSON: '+filename);
    }
    async function saveAs() {
        if(typeof window.showSaveFilePicker!=='function')return window.showModal('الحفظ باسم غير متاح في هذا المتصفح. استخدم زر تنزيل JSON، أو افتح البرنامج في Edge أو Chrome.');
        const current=snapshot(), now=new Date().toISOString();
        const item={id:uniqueId(),name:name(current),updatedAt:now,data:current};
        const text=JSON.stringify({...current,savedAt:now,savedAtSaudi:window.reportSaveTime(now),timeZone:'Asia/Riyadh'},null,2);
        try {
            const handle=await window.showSaveFilePicker({suggestedName:window.exportFileName(name(current),'json'),excludeAcceptAllOption:true,types:[{description:'جدول استماع JSON (.json)',accept:{'application/json':['.json']}}]});
            if(!/\.json$/i.test(handle.name))throw Error('يجب أن ينتهي اسم الملف بـ .json؛ اختر حفظ باسم وأبقِ الامتداد JSON.');
            const writer=await handle.createWritable();await writer.write(text);await writer.close();
            const result=JSON.parse(await (await handle.getFile()).text());
            if(JSON.stringify(result.participants)!==JSON.stringify(current.participants))throw Error('فشل التحقق من بيانات الملف');
            save();status('تم حفظ الجدول المفتوح والتحقق من ملف: '+handle.name);
        }catch(e){if(e.name!=='AbortError'){const message='لم يتم حفظ الملف: '+e.name+' — '+e.message+'؛ يمكنك استخدام تنزيل JSON.';status(message);window.showModal(message);}}
    }
    function folderLabel() {
        if (el('report-save-location')) el('report-save-location').textContent = folder ? folder.name : 'لم يتم تحديد مجلد بعد';
        if (el('archive-folder')) el('archive-folder').textContent = folder ? 'متصل بالمجلد: ' + folder.name : 'تحديد مجلد الحفظ (مرة واحدة)';
    }
    async function pickFolder(forceChange = false) {
        // Click events must not be interpreted as a request to replace the folder.
        forceChange = forceChange === true;
        if (!forceChange && folder) { folderLabel(); return syncAll(); }
        if (typeof window.showDirectoryPicker !== 'function') {
            const message = 'المتصفح الحالي لا يدعم اختيار مجلد للحفظ المباشر. افتح ملف البرنامج في Microsoft Edge أو Google Chrome ثم اضغط تحديد المجلد. يستمر حفظ الجداول داخل المتصفح الحالي.';
            status(message); return window.showModal(message);
        }
        try {
            // Invoke the picker directly during the click, before any IndexedDB await.
            const selected = await window.showDirectoryPicker({mode:'readwrite', id:'quran-auto-save'});
            folder = selected; folderLabel();
            // Persistence must never block writing to a folder already selected.
            void folderStore(selected).catch(()=>{ console.warn('تعذر تذكّر مجلد الحفظ؛ يبقى متصلاً لهذه الجلسة'); });
            await syncAll(true);
        } catch(e) {
            if(e.name==='AbortError') { status(folder ? 'لم يتغير مجلد الحفظ: '+folder.name : 'أُلغي اختيار المجلد؛ اضغط تحديد المجلد للمحاولة مجدداً.'); return; }
            const message = (e.name==='SecurityError' || e.name==='NotAllowedError')
                ? 'المتصفح منع اختيار المجلد أو لم يمنح الإذن. افتح ملف البرنامج مباشرة في Microsoft Edge أو Google Chrome، ثم اضغط تحديد المجلد واسمح بالتعديل داخله.'
                : 'تعذر اختيار المجلد ('+e.name+'). جرّب مجلداً عادياً مثل المستندات وتأكد من السماح بالكتابة.';
            status(message); window.showModal(message);
        }
    }
    const originalRender = window.renderReportTable;
    window.renderReportTable = function(...args) { const result=originalRender.apply(this,args); schedule(); return result; };
    window.addEventListener('DOMContentLoaded', async () => {
        try {
            let stored=await storage(KEY);
            if(stored===undefined){stored=JSON.parse(window.quranCompetition==='local'?'[]':localStorage.getItem(KEY)||'[]');await storage(KEY,stored);}
            trash=await storage(KEY+'_trash');
            if(!Array.isArray(trash)){trash=JSON.parse(window.quranCompetition==='local'?'[]':localStorage.getItem(KEY+'_trash')||'[]');await storage(KEY+'_trash',trash);}
            if(!Array.isArray(stored))throw Error('تنسيق الأرشيف غير صحيح');
            reports=stored.filter(r=>r.id && r.data && Array.isArray(r.data.participants));
            if(window.quranCompetition!=='local'){localStorage.removeItem(KEY);localStorage.removeItem(KEY+'_trash');}
        }
        catch(e) { status('تعذرت قراءة أرشيف الجداول؛ لن تُستبدل البيانات المحفوظة.'); return; }
        ready=true; list();
        el('archive-open').onclick=open; el('archive-new').onclick=fresh; el('archive-download').onclick=download;
        el('archive-delete').onclick=removeSelected;
        el('archive-refresh').onclick=()=>{list();status('تم تحديث قائمة الأرشيف');};
        el('archive-import-file').onchange=importFile;
        el('archive-import').onclick=()=>el('archive-import-file').click();
        el('archive-save-as').onclick=saveAs;
        el('archive-manage').onclick=manageArchives;
        folderLabel();
        void folderStore().then(async handle=>{ if(!handle)return; if(!folder)folder=handle; folderLabel(); if(await folder.queryPermission({mode:'readwrite'})==='granted')await syncAll(true); else status('المجلد محفوظ: '+folder.name+' — اضغط اسم المجلد لتجديد الإذن دون اختياره مجدداً'); }).catch(()=>{});
        el('tab-reports').addEventListener('input', event=>{if(!event.target.id?.startsWith('archive-')){suppressSave=false;schedule();}});
        el('tab-reports').addEventListener('change', event=>{if(!event.target.id?.startsWith('archive-')){suppressSave=false;schedule();}});
        window.addEventListener('pagehide',save);
        status(reports.length ? 'الجداول المحفوظة: '+reports.length : 'يبدأ الحفظ التلقائي عند تعديل الجدول');
    });
})();
