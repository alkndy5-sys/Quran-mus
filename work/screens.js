(() => {
    const $=id=>document.getElementById(id),copy=value=>JSON.parse(JSON.stringify(value));
    const fields=['name','nameEnglish','country','branch','branchDesc'];
    const labels={name:'الاسم العربي',nameEnglish:'الاسم الإنجليزي',country:'الدولة',branch:'الفرع',branchDesc:'تفاصيل الفرع',photo:'الصورة'};
    const defaults={width:150,height:250,background:'',backgroundColor:'#003d24',photo:{x:50,y:30,width:32,height:22,zoom:1,focusX:50,focusY:50,show:true,frameShow:true,frameColor:'#C5A059',frameWidth:.35},name:{x:50,y:52,size:5,color:'#C5A059',font:'Tajawal',line:1.4,show:true},nameEnglish:{x:50,y:57,size:3.4,color:'#C5A059',font:'Arial',line:1.4,show:true},country:{x:50,y:62,size:4,color:'#ffffff',font:'Tajawal',line:1.4,show:true},branch:{x:50,y:72,size:3.5,color:'#C5A059',font:'Tajawal',line:1.4,show:true},branchDesc:{x:50,y:83,size:2.8,color:'#ffffff',font:'Tajawal',line:1.5,show:true}};
    let selected='',scope='single',element='name',ready=false,busy=false,drag=null,renderVersion=0,timer,hitBoxes={};
    const images=new Map();
    const normalize=value=>String(value||'').normalize('NFC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    function state(){const settings=window.appState.settings;const design=settings.screenDesign||=( {global:copy(defaults),individual:{},content:{}} );design.templates||={male:copy(design.global),female:copy(design.global)};for(const existing of [design.global,...Object.values(design.templates),...Object.values(design.individual)]){if(!existing.nameEnglish)existing.nameEnglish=copy(defaults.nameEnglish);if(existing.photo.frameShow===undefined)existing.photo.frameShow=true;if(!existing.photo.frameColor)existing.photo.frameColor='#C5A059';if(existing.photo.frameWidth===undefined)existing.photo.frameWidth=.35;for(const key of fields){if(existing[key].boxWidth===undefined)existing[key].boxWidth=90;if(existing[key].boxHeight===undefined)existing[key].boxHeight=key==='nameEnglish'?3:key==='branchDesc'?12:key==='name'?6:4;}if(existing.nameEnglish.followArabic===undefined)existing.nameEnglish.followArabic=true;}return design;}
    const englishName=p=>window.importedEnglishName(p);
    let scheduledArchives=[];
    function schedulePeople(data){
        const master=window.appState.participants||[],seen=new Set();
        const hash=text=>{let result=2166136261;for(const ch of text){result^=ch.charCodeAt(0);result=Math.imul(result,16777619);}return (result>>>0).toString(36);};
        return (data.participants||[]).map(raw=>{
            const id=raw.id!==undefined&&raw.id!==null?String(raw.id):'';
            let original=id?master.find(p=>String(p.id)===id):null;
            if(!original){const matches=master.filter(p=>normalize(p.name)===normalize(raw.name)&&(!raw.country||normalize(p.country)===normalize(raw.country)));if(matches.length===1)original=matches[0];}
            const merged={...(original||{}),...raw,id:id||String(original?.id||'schedule-'+hash([raw.name,raw.country,raw.branch].join('|')))};
            if(!merged.photo&&original?.photo)merged.photo=original.photo;if(!englishName(merged)&&original)merged.nameEnglish=englishName(original);return merged;
        }).filter(p=>{const gender=data.gender;if(['بنات','أنثى','إناث','اناث'].includes(gender)&&!window.isFemaleParticipant(p))return false;if(['بنين','ذكر','ذكور'].includes(gender)&&window.isFemaleParticipant(p))return false;if(seen.has(p.id))return false;seen.add(p.id);return true;});
    }
    function sourcePeople(){
        const source=$('screen-schedule-source')?.value||state().scheduleSource||'current';
        if(source==='current')return sourcePeopleFromCurrent();
        if(source==='imported')return schedulePeople(state().importedSchedule||{participants:[]});
        if(source==='scheduled'){const map=new Map();for(const report of [...scheduledArchives].sort((a,b)=>String(a.updatedAt).localeCompare(String(b.updatedAt))))for(const p of schedulePeople(report.data))map.set(String(p.id),p);for(const p of sourcePeopleFromCurrent())map.set(String(p.id),p);return Array.from(map.values());}
        const report=scheduledArchives.find(r=>'archive:'+r.id===source);return report?schedulePeople(report.data):[];
    }
    function sourcePeopleFromCurrent(){const ids=new Set((window.appState.reportCustomList||[]).map(String));return schedulePeople({participants:(window.appState.participants||[]).filter(p=>ids.has(String(p.id))),gender:$('report-gender-select')?.value||'الجميع'});}
    const allKnownPeople=()=>Array.from(new Map([...(window.appState.participants||[]),...sourcePeople()].map(p=>[String(p.id),p])).values());
    let scheduleLoad=0;
    async function loadScheduleSources(){
        const version=++scheduleLoad;try{const stored=await window.quranArchiveStorage('quran_report_archive_v1');if(version!==scheduleLoad)return;scheduledArchives=Array.isArray(stored)?stored.filter(r=>Array.isArray(r.data?.participants)):[];
            const select=$('screen-schedule-source'),previous=select.value||state().scheduleSource||'current';select.replaceChildren(new Option('جدول التقارير / الاستماع المفتوح حالياً','current'),new Option('جميع الأسماء المدرجة في الجداول المحفوظة','scheduled'));
            if(state().importedSchedule)select.add(new Option('جدول JSON المستورد: '+(state().importedScheduleLabel||''),'imported'));
            for(const report of [...scheduledArchives].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))))select.add(new Option(report.name+' — '+window.reportSaveTime(report.updatedAt),'archive:'+report.id));
            select.value=Array.from(select.options).some(o=>o.value===previous)?previous:'current';state().scheduleSource=select.value;fillSelect();
        }catch(e){status('تعذر قراءة الجداول المحفوظة: '+e.message);}
    }
    async function importScreenSchedule(event){
        const file=event.target.files?.[0];if(!file)return;try{const raw=JSON.parse((await file.text()).replace(/^\uFEFF/,'')),data=raw.data&&Array.isArray(raw.data.participants)?raw.data:raw;
            if(!Array.isArray(data.participants)||data.participants.some(p=>!p||typeof p.name!=='string'))throw Error('اختر ملف JSON لجدول يحتوي أسماء المشاركين.');
            state().importedSchedule=copy(data);state().importedScheduleLabel=file.name;state().scheduleSource='imported';$('screen-schedule-source').value='';await window.quranArchiveStorage('application_state',copy(window.appState));await loadScheduleSources();status('تم تحميل أسماء الجدول فقط؛ التصدير الجماعي سيستخدم الأسماء المطابقة من هذا الجدول.');
        }catch(e){status('تعذر استيراد الجدول: '+e.message);}finally{event.target.value='';}
    }
    function list(){const gender=$('screen-gender').value,query=normalize($('screen-search').value);return sourcePeople().filter(p=>(gender==='all'||(gender==='female'?window.isFemaleParticipant(p):!window.isFemaleParticipant(p)))&&(!query||normalize(p.name).includes(query)||normalize(state().content[String(p.id)]?.nameEnglish??englishName(p)).includes(query)));}
    const person=()=>list().find(p=>String(p.id)===selected);
    const group=p=>window.isFemaleParticipant(p||{})?'female':'male';
    const layout=p=>state().individual[String(p?.id)]||state().templates[group(p)];
    function content(p){const override=state().content[String(p.id)]||{};return {...p,branchDesc:window.participantBranchDescription(p),...override,nameEnglish:String(override.nameEnglish||'').trim()||englishName(p)};}
    function status(text){$('screen-status').textContent=text;}
    function save(){clearTimeout(timer);timer=setTimeout(()=>{window.quranArchiveStorage('application_state',copy(window.appState)).then(()=>status('تم حفظ تصميم الشاشات داخل المتصفح')).catch(e=>status('تعذر الحفظ: '+e.message));},500);}
    function alter(fn){const p=person();if(!p)return;const s=state(),category=group(p);if(scope==='list'){for(const other of sourcePeople()){const id=String(other.id);s.individual[id]||=copy(s.templates[group(other)]);fn(s.individual[id]);}}else if(scope==='all'){fn(s.templates[category]);for(const other of allKnownPeople()){const id=String(other.id);if(group(other)===category&&s.individual[id])fn(s.individual[id]);}}else{const id=String(p.id);s.individual[id]||=copy(s.templates[category]);fn(s.individual[id]);}syncControls();void preview();save();}
    function fillSelect(){
        const people=list(),select=$('screen-person');select.replaceChildren();people.forEach(p=>select.add(new Option(p.name+' — '+(p.country||''),String(p.id))));
        if(!people.some(p=>String(p.id)===selected))selected=people[0]?String(people[0].id):'';select.value=selected;
        $('screen-count').textContent='أسماء الجدول المطابقة: '+people.length+' من '+sourcePeople().length+'؛ لن تُصدّر أسماء خارج الجدول المحدد.';syncControls();void preview();
    }
    function effectiveTextBox(l,key){const q=l[key];if(key==='nameEnglish'&&q.followArabic)return {...q,x:l.name.x,y:l.name.y+(l.name.boxHeight+q.boxHeight)/2+1};return q;}
    function syncControls(){
        const p=person();if(!p)return;const l=layout(p),item=l[element],data=content(p);
        $('screen-apply-all').textContent=scope==='list'?'حفظ وتطبيق التنسيق على كامل القائمة':'حفظ وتطبيق التنسيق على '+(group(p)==='female'?'الإناث فقط':'الذكور فقط');
        $('screen-scope').options[1].textContent='جميع '+(group(p)==='female'?'الإناث فقط':'الذكور فقط');
        $('screen-template-status').textContent='التنسيق الحالي: '+(group(p)==='female'?'الإناث':'الذكور')+' — يُحفظ مستقلاً عن الفئة الأخرى.';
        $('screen-width').value=l.width;$('screen-height').value=l.height;$('screen-bg-color').value=l.backgroundColor;$('screen-photo-visible').checked=l.photo.show;$('screen-photo-frame-show').checked=l.photo.frameShow;$('screen-photo-frame-color').value=l.photo.frameColor;$('screen-photo-frame-width').value=l.photo.frameWidth;
        $('screen-x').value=item.x;$('screen-y').value=item.y;$('screen-element-show').checked=item.show;
        $('screen-text-controls').hidden=element==='photo';$('screen-photo-controls').hidden=element!=='photo';
        if(element==='photo'){for(const [key,id]of [['width','screen-photo-width'],['height','screen-photo-height'],['zoom','screen-photo-zoom'],['focusX','screen-photo-focus-x'],['focusY','screen-photo-focus-y']])$(id).value=item[key];}
        else{$('screen-text-box-width').value=item.boxWidth;$('screen-text-box-height').value=item.boxHeight;$('screen-font-size').value=item.size;$('screen-font-color').value=item.color;$('screen-font').value=item.font;$('screen-line-height').value=item.line;}
        fields.forEach(key=>$('screen-content-'+key).value=data[key]||'');updateOutputLabel();
    }
    const limited=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||min));
    function updateOutputLabel(){const p=person();if(!p)return;const l=layout(p),long=Math.min(Number($('screen-resolution').value),Math.sqrt(60000000*Math.max(l.width,l.height)/Math.min(l.width,l.height))),factor=long/Math.max(l.width,l.height);$('screen-output-size').textContent=Math.round(l.width*factor)+' × '+Math.round(l.height*factor)+' بكسل؛ نحو '+Math.round(factor*2.54)+' DPI عند المقاس المحدد.';}
    async function image(src){if(!src)return null;if(!images.has(src)){const promise=new Promise((resolve,reject)=>{const img=new Image();if(!src.startsWith('data:')&&!src.startsWith('blob:'))img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(Error('تعذر تحميل إحدى الصور'));img.src=src;});images.set(src,promise);promise.catch(()=>images.delete(src));}return images.get(src);}
    function cover(ctx,img,x,y,w,h,zoom=1,focusX=50,focusY=50){const factor=Math.max(w/img.naturalWidth,h/img.naturalHeight)*zoom;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(img,x+(w-img.naturalWidth*factor)*focusX/100,y+(h-img.naturalHeight*factor)*focusY/100,img.naturalWidth*factor,img.naturalHeight*factor);ctx.restore();}
    function wrap(text,width,measure){return window.cardExportTextLines(text,width,measure);}
    async function draw(canvas,p,long,editing=false){
        const l=layout(p),data=content(p),factor=long/Math.max(l.width,l.height);canvas.width=Math.round(l.width*factor);canvas.height=Math.round(l.height*factor);
        if(canvas.width*canvas.height>61000000)throw Error('المقاس يتجاوز حد الدقة؛ اختر دقة أقل.');
        const ctx=canvas.getContext('2d');ctx.fillStyle=l.backgroundColor;ctx.fillRect(0,0,canvas.width,canvas.height);
        if(l.background){const bg=await image(l.background);cover(ctx,bg,0,0,canvas.width,canvas.height);}
        const boxes={};
        if(l.photo.show){const q=l.photo,w=canvas.width*q.width/100,h=canvas.height*q.height/100,x=canvas.width*q.x/100-w/2,y=canvas.height*q.y/100-h/2;boxes.photo={x,y,w,h};
            const img=await image(data.photo||'');
            if(img)cover(ctx,img,x,y,w,h,q.zoom,q.focusX,q.focusY);else{ctx.fillStyle='#ffffff20';ctx.fillRect(x,y,w,h);ctx.fillStyle='#cbd5d1';ctx.beginPath();ctx.arc(x+w/2,y+h*.35,Math.min(w,h)*.16,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(x+w/2,y+h*.75,w*.28,h*.2,0,0,Math.PI*2);ctx.fill();}
        }
        if(l.photo.frameShow){const q=l.photo,w=canvas.width*q.width/100,h=canvas.height*q.height/100,x=canvas.width*q.x/100-w/2,y=canvas.height*q.y/100-h/2,b=Math.min(w,h,canvas.width*q.frameWidth/100);boxes.photo={x,y,w,h};ctx.save();ctx.strokeStyle=q.frameColor;ctx.lineWidth=b;ctx.strokeRect(x+b/2,y+b/2,w-b,h-b);ctx.restore();}
        for(const key of fields){const q=effectiveTextBox(l,key);if(!q.show)continue;
            const boxW=canvas.width*q.boxWidth/100,boxH=canvas.height*q.boxHeight/100,x=canvas.width*q.x/100,y=canvas.height*q.y/100;
            await document.fonts.load('700 '+(canvas.width*q.size/100)+'px "'+q.font+'"');
            ctx.fillStyle=q.color;ctx.direction=key==='nameEnglish'?'ltr':'rtl';ctx.textAlign='center';ctx.textBaseline='alphabetic';
            const text=data[key]||'',padding=Math.min(4,boxW*.02),available=Math.max(1,boxW-padding*2);
            let size=canvas.width*q.size/100,lines=[];
            const measure=fontSize=>{ctx.font='700 '+fontSize+'px "'+q.font+'", Arial, sans-serif';return wrap(text,available,t=>ctx.measureText(t).width);};
            lines=measure(size);if(lines.length*size*q.line>boxH){let low=.1,high=size;for(let i=0;i<18;i++){const mid=(low+high)/2,trial=measure(mid);if(trial.length*mid*q.line<=boxH)low=mid;else high=mid;}size=low;lines=measure(size);}
            const line=size*q.line,total=lines.length*line,top=y-total/2;
            ctx.save();ctx.beginPath();ctx.rect(x-boxW/2,y-boxH/2,boxW,boxH);ctx.clip();
            lines.forEach((text,i)=>{const m=ctx.measureText(text),a=m.actualBoundingBoxAscent||size*.8,d=m.actualBoundingBoxDescent||size*.2;ctx.fillText(text,x,top+(i+.5)*line+(a-d)/2);});ctx.restore();boxes[key]={x:x-boxW/2,y:y-boxH/2,w:boxW,h:boxH};
        }
        if(editing){hitBoxes=boxes;const box=boxes[element];if(box){ctx.save();ctx.strokeStyle='#38bdf8';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.setLineDash([]);ctx.fillStyle='#38bdf8';ctx.fillRect(box.x+box.w-7,box.y+box.h-7,14,14);ctx.restore();}}
        return canvas;
    }
    async function preview(){const version=++renderVersion,p=person(),canvas=$('screen-canvas');if(!p){canvas.width=450;canvas.height=650;canvas.getContext('2d').clearRect(0,0,450,650);status('لا توجد أسماء مطابقة');return;}try{const temp=document.createElement('canvas');await draw(temp,p,900,true);if(version!==renderVersion)return;canvas.width=temp.width;canvas.height=temp.height;canvas.getContext('2d').drawImage(temp,0,0);}catch(e){status(e.message);}}
    function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});}
    let backgroundRemovalModule,removingBackground=false;
    async function backgroundRemover(){
        if(!backgroundRemovalModule)backgroundRemovalModule=import('https://esm.sh/@imgly/background-removal@1.7.0?deps=onnxruntime-web@1.21.0').catch(error=>{backgroundRemovalModule=null;throw error;});
        const module=await backgroundRemovalModule;return module.removeBackground||module.default;
    }
    async function removePhotoBackground(){
        if(removingBackground)return;const p=person();if(!p)return status('اختر المتسابق أو المتسابقة أولاً.');
        const id=String(p.id),original=content(p).photo;if(!original)return status('أضف صورة للمتسابق أولاً.');
        removingBackground=true;$('screen-remove-photo-bg').disabled=true;$('screen-restore-photo-bg').disabled=true;
        status('جارٍ تحميل أداة إزالة الخلفية؛ أول استخدام يحتاج الإنترنت وقد يستغرق بضع دقائق...');
        try{
            const img=await image(original),canvas=document.createElement('canvas');const scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
            canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
            const input=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;if(!input)throw Error('تعذر قراءة الصورة');
            const remove=await backgroundRemover();status('جارٍ فصل الشخص عن الخلفية داخل جهازك...');
            const result=await remove(input,{device:'cpu',model:'isnet_fp16',proxyToWorker:false,output:{format:'image/png'},progress:(key,current,total)=>{if(total>0)status('تجهيز أداة إزالة الخلفية: '+Math.round(current/total*100)+'%');}});
            if(!(result instanceof Blob)||!result.size)throw Error('لم تُنتج الأداة صورة صالحة');
            const transparent=await readFile(result);await image(transparent);
            if(content(p).photo!==original)throw Error('تغيّرت الصورة أثناء المعالجة؛ أعد المحاولة للصورة الجديدة.');
            const entry=state().content[id]||{};const previous=copy(entry);state().content[id]={...entry,photo:transparent,photoBeforeRemoval:entry.photoBeforeRemoval||original};
            try{await window.quranArchiveStorage('application_state',copy(window.appState));}catch(error){state().content[id]=previous;throw error;}
            if(person()?.id===p.id){syncControls();await preview();}status('تمت إزالة الخلفية وحفظ صورة PNG شفافة لهذا التصميم. يمكنك استعادة الأصل.');
        }catch(error){status('تعذرت إزالة الخلفية: '+error.message+'؛ تأكد من اتصال الإنترنت وجرّب Edge أو Chrome. الصورة الأصلية لم تتغير.');}
        finally{removingBackground=false;$('screen-remove-photo-bg').disabled=false;$('screen-restore-photo-bg').disabled=false;}
    }
    async function restorePhotoBackground(){
        const p=person();if(!p)return;const id=String(p.id),entry=state().content[id];if(!entry?.photoBeforeRemoval)return status('لا توجد صورة سابقة لاستعادتها لهذا التصميم.');
        const previous=copy(entry);entry.photo=entry.photoBeforeRemoval;delete entry.photoBeforeRemoval;
        try{await window.quranArchiveStorage('application_state',copy(window.appState));await preview();status('تمت استعادة صورة المتسابق بخلفيتها الأصلية.');}
        catch(error){state().content[id]=previous;status('تعذرت الاستعادة: '+error.message);}
    }
    async function upload(event,kind){const input=event.target,file=input.files?.[0];if(!file)return;try{if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('اختر صورة JPG أو PNG أو WebP');const value=await readFile(file);await image(value);if(kind==='background')alter(l=>l.background=value);else{const p=person();if(!p)return;state().content[String(p.id)]={...(state().content[String(p.id)]||{}),photo:value,photoBeforeRemoval:null};void preview();save();}}catch(e){status(e.message);}finally{input.value='';}}
    function pngPhysical(blob,widthCM,heightCM){return blob.arrayBuffer().then(buffer=>{
        const input=new Uint8Array(buffer),view=new DataView(buffer),chunks=[];let offset=8;chunks.push(input.slice(0,8));
        const payload=new Uint8Array(21),v=new DataView(payload.buffer);v.setUint32(0,9);payload.set([112,72,89,115],4);const pixelsW=view.getUint32(16),pixelsH=view.getUint32(20);v.setUint32(8,Math.round(pixelsW/(widthCM/100)));v.setUint32(12,Math.round(pixelsH/(heightCM/100)));payload[16]=1;
        let crc=0xffffffff;for(const byte of payload.slice(4,17)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}v.setUint32(17,(crc^0xffffffff)>>>0);
        let added=false;while(offset<input.length){const length=view.getUint32(offset),type=String.fromCharCode(...input.slice(offset+4,offset+8));if(type==='IDAT'&&!added){chunks.push(payload);added=true;}if(type!=='pHYs')chunks.push(input.slice(offset,offset+length+12));offset+=length+12;}return new Blob(chunks,{type:'image/png'});
    });}
    async function renderFile(p){const canvas=document.createElement('canvas');try{const l=layout(p),long=Math.min(Number($('screen-resolution').value),Math.sqrt(60000000*Math.max(l.width,l.height)/Math.min(l.width,l.height)));await draw(canvas,p,long);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('تعذر إنشاء الصورة');return await pngPhysical(blob,l.width,l.height);}finally{canvas.width=canvas.height=0;}}
    async function exportScreens(all){if(busy)return;const people=all?list():[person()].filter(Boolean);if(!people.length)return status('اختر اسماً أولاً');busy=true;$('screen-export-current').disabled=$('screen-export-all').disabled=true;$('screen-stop').hidden=false;
        try{await window.quranArchiveStorage('application_state',copy(window.appState));if(!all){status('جارٍ تجهيز الصورة عالية الدقة...');const p=people[0],blob=await renderFile(p);window.downloadFileBlob(blob,'شاشة - '+content(p).name,'png');status('تم تجهيز الصورة الحالية مع أبعادها الفعلية.');}
            else{if(typeof JSZip==='undefined')throw Error('مكتبة ZIP غير محملة؛ تحقق من اتصال الإنترنت.');let group=0;for(let start=0;start<people.length&&busy;start+=5){const zip=new JSZip();for(let i=start;i<Math.min(start+5,people.length)&&busy;i++){status('تصدير '+(i+1)+' من '+people.length+'...');const p=people[i],blob=await renderFile(p);zip.file(window.exportFileName('شاشة - '+content(p).name+' - '+p.id,'png'),await blob.arrayBuffer());}const archive=await zip.generateAsync({type:'blob',compression:'STORE'});window.downloadFileBlob(archive,'تصميم الشاشات - الجزء '+(++group),'zip');}status(busy?'اكتمل تصدير الأسماء المطابقة في ملفات ZIP؛ كل جزء يحتوي حتى 5 صور.':'تم إيقاف التصدير بعد الصورة الحالية.');}
        }catch(e){status('تعذر التصدير: '+e.message);}finally{busy=false;$('screen-export-current').disabled=$('screen-export-all').disabled=false;$('screen-stop').hidden=true;}}
    function canvasPoint(event){const canvas=$('screen-canvas'),r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)*canvas.width/r.width,y:(event.clientY-r.top)*canvas.height/r.height};}
    function initialize(){if(ready)return;ready=true;
        $('screen-remove-photo-bg').onclick=removePhotoBackground;$('screen-restore-photo-bg').onclick=restorePhotoBackground;
        $('screen-schedule-source').onchange=()=>{state().scheduleSource=$('screen-schedule-source').value;fillSelect();save();};$('screen-import-schedule').onchange=importScreenSchedule;$('screen-refresh-schedules').onclick=loadScheduleSources;
        $('screen-search').oninput=fillSelect;$('screen-gender').onchange=fillSelect;$('screen-person').onchange=()=>{selected=$('screen-person').value;syncControls();void preview();};
        $('screen-refresh-names').onclick=loadScheduleSources;
        $('screen-sync-names').onclick=()=>{for(const p of window.appState.participants||[]){const entry=state().content[String(p.id)];if(entry){delete entry.name;delete entry.nameEnglish;}}fillSelect();save();status('تم تحديث الاسم العربي والإنجليزي من قاعدة المتسابقين مع الحفاظ على تنسيق الشاشات.');};
        $('screen-english-below').onclick=()=>alter(l=>{l.nameEnglish.followArabic=true;l.nameEnglish.show=true;});
        $('screen-scope').onchange=()=>{scope=$('screen-scope').value;syncControls();};$('screen-element').onchange=()=>{element=$('screen-element').value;syncControls();void preview();};
        for(const [id,key,min,max]of [['screen-width','width',10,1000],['screen-height','height',10,1000]])$(id).onchange=()=>alter(l=>l[key]=limited($(id).value,min,max));
        $('screen-bg-color').oninput=()=>alter(l=>l.backgroundColor=$('screen-bg-color').value);$('screen-background').onchange=e=>upload(e,'background');$('screen-remove-background').onclick=()=>alter(l=>l.background='');$('screen-upload-photo').onchange=e=>upload(e,'photo');
        const controls=[['screen-text-box-width','boxWidth',5,98],['screen-text-box-height','boxHeight',1,60],['screen-x','x',0,100],['screen-y','y',0,100],['screen-font-size','size',.5,20],['screen-line-height','line',1,3],['screen-photo-width','width',1,95],['screen-photo-height','height',1,95],['screen-photo-zoom','zoom',1,4],['screen-photo-focus-x','focusX',0,100],['screen-photo-focus-y','focusY',0,100]];
        controls.forEach(([id,key,min,max])=>$(id).oninput=()=>alter(l=>l[element][key]=limited($(id).value,min,max)));
        $('screen-font-color').oninput=()=>alter(l=>l[element].color=$('screen-font-color').value);$('screen-font').onchange=()=>alter(l=>l[element].font=$('screen-font').value);$('screen-element-show').onchange=()=>alter(l=>l[element].show=$('screen-element-show').checked);
        fields.forEach(key=>$('screen-content-'+key).oninput=()=>{const p=person();if(!p)return;state().content[String(p.id)]={...(state().content[String(p.id)]||{}),[key]:$('screen-content-'+key).value};void preview();save();});
        $('screen-reset-defaults').onclick=()=>{const p=person();if(!p)return;window.showModal(scope==='list'?'استعادة الضبط الافتراضي لكامل قائمة الجدول؟ ستبقى الخلفيات والنصوص والصور المحفوظة.':scope==='all'?'استعادة الضبط الافتراضي لجميع تصاميم فئة الاسم المعروض فقط؟ ستبقى الخلفيات والنصوص والصور المحفوظة.':'استعادة الضبط الافتراضي للتصميم المعروض؟ ستبقى الخلفية والنصوص والصورة المحفوظة.',true,()=>{alter(l=>{const background=l.background;Object.assign(l,copy(defaults));l.background=background;});status('تمت استعادة المقاسات والمواضع والتنسيق الافتراضي حسب نطاق التطبيق.');});};
        $('screen-photo-visible').onchange=()=>alter(l=>l.photo.show=$('screen-photo-visible').checked);
        $('screen-photo-frame-show').onchange=()=>alter(l=>l.photo.frameShow=$('screen-photo-frame-show').checked);
        $('screen-photo-frame-color').oninput=()=>alter(l=>l.photo.frameColor=$('screen-photo-frame-color').value);
        $('screen-photo-frame-width').oninput=()=>alter(l=>l.photo.frameWidth=limited($('screen-photo-frame-width').value,.05,2));
        $('screen-apply-all').onclick=()=>{const p=person();if(!p)return;const current=copy(layout(p)),category=group(p),s=state();if(scope==='list'){for(const other of sourcePeople())s.individual[String(other.id)]=copy(current);syncControls();void preview();save();status('تم تطبيق التصميم على كامل قائمة الجدول، للذكور والإناث.');return;}s.templates[category]=current;for(const other of window.appState.participants||[])if(group(other)===category)delete s.individual[String(other.id)];scope='all';$('screen-scope').value='all';syncControls();void preview();save();status('تم حفظ وتطبيق تنسيق '+(category==='female'?'الإناث':'الذكور')+' فقط؛ بقي تنسيق الفئة الأخرى وبيانات المشاركين كما هي.');};
        $('screen-export-current').onclick=()=>exportScreens(false);$('screen-export-all').onclick=()=>exportScreens(true);$('screen-stop').onclick=()=>{busy=false;};$('screen-resolution').onchange=updateOutputLabel;
        const canvas=$('screen-canvas');canvas.onpointerdown=event=>{if(!person())return;const at=canvasPoint(event),selectedBox=hitBoxes[element];
            const resizing=selectedBox&&Math.abs(at.x-(selectedBox.x+selectedBox.w))<=18&&Math.abs(at.y-(selectedBox.y+selectedBox.h))<=18;
            const keys=[element,...['photo',...fields].filter(k=>k!==element)];const key=resizing?element:keys.find(k=>{const b=hitBoxes[k];return b&&at.x>=b.x&&at.x<=b.x+b.w&&at.y>=b.y&&at.y<=b.y+b.h;});if(!key)return;
            element=key;$('screen-element').value=key;syncControls();const l=layout(person()),q=key==='photo'?l.photo:effectiveTextBox(l,key);drag={mode:resizing?'resize':'move',x:at.x,y:at.y,baseX:q.x,baseY:q.y,baseW:key==='photo'?q.width:q.boxWidth,baseH:key==='photo'?q.height:q.boxHeight};canvas.setPointerCapture(event.pointerId);void preview();};
        canvas.onpointermove=event=>{if(!drag)return;const at=canvasPoint(event),dx=(at.x-drag.x)/canvas.width*100,dy=(at.y-drag.y)/canvas.height*100;
            if(drag.mode==='resize'){const w=limited(drag.baseW+2*dx,5,98),h=limited(drag.baseH+2*dy,1,element==='photo'?95:60);alter(l=>{const q=l[element];if(element==='photo'){q.width=w;q.height=h;}else{q.boxWidth=w;q.boxHeight=h;}});}
            else{const x=limited(drag.baseX+dx,0,100),y=limited(drag.baseY+dy,0,100);alter(l=>{l[element].x=x;l[element].y=y;if(element==='nameEnglish')l[element].followArabic=false;});}
        };canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};canvas.ondblclick=()=>{if(element==='photo')$('screen-upload-photo').click();else $('screen-content-'+element).focus();};

    }
    const switchTab=window.switchTab;window.switchTab=function(id){switchTab(id);if(id==='screens'){initialize();void loadScheduleSources();}};
    const renderAll=window.renderAll;window.renderAll=function(...args){const result=renderAll.apply(this,args);if(ready)fillSelect();return result;};
})();
