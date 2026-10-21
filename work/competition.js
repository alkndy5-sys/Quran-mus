(() => {
    const $=id=>document.getElementById(id);
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const safeURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
    const config=()=>window.appState.settings.competition||{};
    const message=text=>{if($('competition-status'))$('competition-status').textContent=text;};
    const source=()=>window.appState.settings.cardDataSource==='staff'?'staff':'participants';
    const personKey=p=>source()+':'+String(p.id);
    const tokenFor=p=>{const peers=[...(window.appState.participants||[]),...(window.appState.staffList||[])];if(!p.cardToken||peers.some(other=>other!==p&&other.cardToken===p.cardToken))p.cardToken=crypto.randomUUID().replaceAll('-','');return p.cardToken;};
    const profileData=p=>{
        const c=config();
        return {token:tokenFor(p),recordKey:personKey(p),name:p.name||'',photo:p.photo||'',country:p.country||'',role:p.jobTitle||p.branch||'',competition:{name:c.name||'',logo:c.logo||'',hotelName:c.hotelName||'',hotelAddress:c.hotelAddress||'',hotelURL:safeURL(c.hotelURL),contacts:c.contacts||'',country:c.country||'',pageBackground:c.pageBackground||'#f3f5f3',pageImage:c.pageImage||''}};
    };
    const fingerprint=data=>JSON.stringify(data);
    const published=new Map();
    function publicOrigin(){const c=config();return safeURL(c.siteURL||window.competitionSiteOrigin||'').replace(/\/$/,'');}
    function cardLink(p){return publicOrigin()+'/c/'+tokenFor(p);}
    const hex=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;
    const bounded=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
    function badge(p){
        const cfg=config();if(!cfg.enabled)return '';if(!publicOrigin())return '';
        try {
            const qr=qrcode(0,'M');qr.addData(cardLink(p),'Byte');qr.make();
            const count=qr.getModuleCount(),quiet=4,total=count+quiet*2;let path='';
            for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))path+='M'+(x+quiet)+' '+(y+quiet)+'h1v1h-1z';
            const ink=hex(cfg.qrColor,'#000000'),background=hex(cfg.qrBackground,'#ffffff');
            const canvas=document.createElement('canvas'),unit=12;canvas.width=canvas.height=total*unit;
            const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle=ink;
            for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))context.fillRect((x+quiet)*unit,(y+quiet)*unit,unit,unit);
            const image=canvas.toDataURL('image/png');
            const w=Number($('card-width')?.value||5.5)*10,h=Number($('card-height')?.value||8.5)*10;
            const size=bounded(cfg.qrSize,19,12,Math.max(12,Math.min(w,h)-2)),label=!!cfg.qrLabel;
            const right=bounded(cfg.qrRight,3,0,Math.max(0,w-size)),bottom=bounded(cfg.qrBottom,3,0,Math.max(0,h-size-(label?3:0)));
            return '<div class="card-qr-badge" style="position:absolute;right:'+right+'mm;bottom:'+bottom+'mm;z-index:5;width:'+size+'mm;height:'+(size+(label?3:0))+'mm;background:'+background+';display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box"><img src="'+image+'" alt="QR صفحة '+escape(p.name)+'" style="width:'+size+'mm;height:'+size+'mm;display:block;flex-shrink:0;max-width:none;image-rendering:pixelated;object-fit:contain">'+(label?'<span style="font:6px Arial,sans-serif;color:'+ink+';line-height:3mm;white-space:nowrap">بيانات المسابقة</span>':'')+'</div>';
        }catch(e){return ''; }
    }
    window.toggleCardQRCode=function(enabled){
        window.appState.settings.competition={...config(),enabled:!!enabled};
        for(const id of ['competition-enable-qr','card-show-qr'])if($(id))$(id).checked=!!enabled;
        window.renderCustomCard();window.saveDatabase();
    };
    let designSaveTimer;
    window.updateQRDesign=function(){
        const cfg=config();
        window.appState.settings.competition={...cfg,qrSize:Number($('competition-qr-size').value),qrRight:Number($('competition-qr-right').value),qrBottom:Number($('competition-qr-bottom').value),qrColor:$('competition-qr-color').value,qrBackground:$('competition-qr-background').value,qrLabel:$('competition-qr-label').checked,pageBackground:$('competition-page-background').value};
        window.renderCustomCard();clearTimeout(designSaveTimer);designSaveTimer=setTimeout(()=>window.saveDatabase(),400);
    };
    window.uploadCompetitionBackground=async function(event){
        const file=event.target.files?.[0];if(!file)return;try{if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('اختر صورة PNG أو JPG أو WebP.');window.appState.settings.competition={...config(),pageImage:await compactImage(file,1200)};await window.quranArchiveStorage('application_state',JSON.parse(JSON.stringify(window.appState)));message('تم حفظ خلفية صفحة المشارك؛ افتح المعاينة لرؤيتها.');}catch(e){message(e.message);}finally{event.target.value='';}
    };
    window.removeCompetitionBackground=function(){window.appState.settings.competition={...config(),pageImage:''};window.saveDatabase();message('تمت إزالة صورة الخلفية.');};
    const originalBuild=window.buildCardHTML;
    window.buildCardHTML=function(p,...args){const html=originalBuild.call(this,p,...args),pos=html.lastIndexOf('</div>');return html.slice(0,pos)+badge(p)+html.slice(pos);};
    const originalRender=window.renderCustomCard;
    window.renderCustomCard=function(...args){const result=originalRender.apply(this,args);$('preview-qr-holder')?.remove();const card=$('custom-card-preview');const p=window.getActiveCardList().find(p=>String(p.id)===String($('card-participant-select')?.value));if(card&&p){const holder=document.createElement('div');holder.id='preview-qr-holder';holder.innerHTML=badge(p);card.appendChild(holder);}return result;};
    function renderProfile(data){
        const c=data.competition;
        return '<div style="max-width:460px;margin:auto;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px #003d2420;font-family:Tajawal,Arial,sans-serif;color:#19382e;text-align:center;direction:rtl"><header style="background:#003D24;padding:24px;color:white">'+(c.logo?'<img src="'+escape(c.logo)+'" alt="شعار المسابقة" style="max-width:130px;max-height:90px;object-fit:contain;margin:auto auto 12px">':'')+'<h2 style="font-size:20px;margin:0">'+escape(c.name)+'</h2></header><main style="padding:24px">'+(data.photo?'<img src="'+escape(data.photo)+'" alt="'+escape(data.name)+'" style="width:100px;height:100px;object-fit:cover;border:3px solid #C5A059;border-radius:18px;margin:0 auto 15px">':'')+'<h1 style="font-size:25px;margin:0 0 8px">'+escape(data.name)+'</h1><p>'+escape(data.role)+'</p><p style="color:#A37F3C;font-weight:bold">'+escape(data.country)+'</p><section style="background:#f9f6f0;padding:16px;border-radius:14px;margin-top:20px;text-align:center"><h3>الإقامة والفندق</h3><strong>'+escape(c.hotelName)+'</strong><p>'+escape(c.hotelAddress)+'</p><p>'+escape(c.country)+'</p>'+(c.hotelURL?'<a target="_blank" rel="noopener" href="'+escape(c.hotelURL)+'" style="display:inline-block;background:#003D24;color:white;padding:10px 16px;border-radius:10px;text-decoration:none">فتح موقع الفندق</a>':'')+'</section><section style="padding:16px;text-align:center"><h3>التواصل مع المسابقة</h3><p style="white-space:pre-wrap;unicode-bidi:plaintext">'+escape(c.contacts)+'</p></section></main></div>';
    }
    window.previewCompetitionProfile=async function(){
        if(!await window.saveCompetitionDesign())return;
        const p=window.getActiveCardList().find(p=>String(p.id)===String($('card-participant-select')?.value));
        if(!p)return window.showModal('اختر الاسم أولاً.');
        const modal=document.createElement('div');modal.className='fixed inset-0 z-50 overflow-y-auto p-6';modal.style.backgroundColor=hex(config().pageBackground,'#f3f5f3');if(config().pageImage){modal.style.backgroundImage='url('+JSON.stringify(config().pageImage)+')';modal.style.backgroundSize='cover';modal.style.backgroundPosition='center';}
        const close=document.createElement('button');close.textContent='إغلاق المعاينة';close.className='block mx-auto mb-4 bg-white p-2 rounded-lg';close.onclick=()=>modal.remove();modal.appendChild(close);
        const page=document.createElement('div');page.innerHTML=renderProfile(profileData(p));modal.appendChild(page);document.body.appendChild(modal);
    };
    window.saveCompetitionDesign=async function(){
        const current=config();
        const next={...current,name:$('competition-name').value.trim(),hotelName:$('competition-hotel-name').value.trim(),hotelAddress:$('competition-hotel-address').value.trim(),hotelURL:$('competition-hotel-url').value.trim(),country:$('competition-country').value.trim(),contacts:$('competition-contacts').value.trim(),enabled:$('competition-enable-qr').checked,siteURL:window.competitionSiteOrigin||current.siteURL||''};
        if(next.hotelURL&&!safeURL(next.hotelURL)){window.showModal('أدخل رابط الفندق كاملاً يبدأ بـ https://');return false;}
        if(next.enabled&&!next.name){window.showModal('أدخل مسمى المسابقة أولاً.');return false;}
        window.appState.settings.competition=next;
        try{await window.quranArchiveStorage('application_state',JSON.parse(JSON.stringify(window.appState)));published.clear();window.renderCustomCard();message('تم حفظ تصميم بيانات المسابقة. انشر صفحات المشاركين قبل طباعة الرموز.');return true;}
        catch(e){message('تعذر حفظ البيانات: '+e.message);return false;}
    };
    window.uploadCompetitionLogo=async function(event){
        const file=event.target.files?.[0];if(!file)return;
        try{
            if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('اختر شعار PNG أو JPG أو WebP.');
            const logo=await compactImage(file,280);
            window.appState.settings.competition={...config(),logo};
            await window.quranArchiveStorage('application_state',JSON.parse(JSON.stringify(window.appState)));
            $('competition-logo-preview').src=logo;$('competition-logo-preview').classList.remove('hidden');message('تم حفظ شعار المسابقة.');
        }catch(e){message(e.message);}finally{event.target.value='';}
    };
    async function compactImage(file,size){
        const url=typeof file==='string'?file:URL.createObjectURL(file);
        try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.82);}finally{if(typeof file!=='string')URL.revokeObjectURL(url);}
    }
    let drafts=[];
    async function saveDraftProfiles(people){
        const existing=await window.quranArchiveStorage('competition_profile_drafts')||[];
        const map=new Map(existing.map(item=>[item.token,item]));
        for(const person of people){const data=profileData(person);map.set(data.token,{...data,draftSavedAt:new Date().toISOString()});}
        drafts=Array.from(map.values());
        await window.quranArchiveStorage('competition_profile_drafts',drafts);
        await window.quranArchiveStorage('application_state',JSON.parse(JSON.stringify(window.appState)));
        renderDraftList();return drafts;
    }
    function renderDraftList(){
        const select=$('competition-draft-list');if(!select)return;const selected=select.value;select.replaceChildren(new Option('اختر صفحة محفوظة محلياً',''));
        drafts.forEach(item=>select.add(new Option(item.name+' — '+(item.country||item.role||'')+' — '+new Date(item.draftSavedAt).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}),item.token)));
        select.value=selected;
    }
    function showDraft(data){
        const modal=document.createElement('div');modal.className='fixed inset-0 z-50 overflow-y-auto p-6';modal.style.backgroundColor=hex(data.competition.pageBackground,'#f3f5f3');
        if(data.competition.pageImage){modal.style.backgroundImage='url('+JSON.stringify(data.competition.pageImage)+')';modal.style.backgroundSize='cover';modal.style.backgroundPosition='center';}
        const close=document.createElement('button');close.textContent='إغلاق المعاينة المحلية';close.className='block mx-auto mb-4 bg-white p-2 rounded-lg';close.onclick=()=>modal.remove();modal.appendChild(close);
        const body=document.createElement('div');body.innerHTML=renderProfile(data);modal.appendChild(body);document.body.appendChild(modal);
    }
    window.saveCompetitionDrafts=async function(){
        try{if(!await window.saveCompetitionDesign())return;await saveDraftProfiles(window.getActiveCardList());message('حُفظت بيانات صفحات القائمة داخل المتصفح. يمكنك استعراضها دون نشر أو تسجيل دخول.');}
        catch(e){window.showModal('تعذر حفظ المسودة: '+e.message);}
    };
    window.viewCompetitionDraft=function(){const item=drafts.find(item=>item.token===$('competition-draft-list').value);if(!item)return window.showModal('اختر صفحة محفوظة من القائمة أولاً.');showDraft(item);};
    window.downloadCompetitionDraft=async function(){
        try{if(!await window.saveCompetitionDesign())return;const p=window.getActiveCardList().find(p=>String(p.id)===String($('card-participant-select')?.value));if(!p)return window.showModal('اختر الاسم أولاً.');
            await saveDraftProfiles([p]);const data=profileData(p);
            const page='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(data.name)+'</title><style>body{margin:0;padding:24px;background:'+hex(data.competition.pageBackground,'#f3f5f3')+';font-family:Arial,sans-serif}img{display:block}*{box-sizing:border-box}</style></head><body>'+renderProfile(data)+'</body></html>';
            window.downloadFileBlob(new Blob([page],{type:'text/html;charset=utf-8'}),'صفحة مشارك - '+data.name,'html');message('حُفظت صفحة HTML محلية يمكن فتحها قبل النشر. رابط QR يحتاج النشر لاحقاً.');
        }catch(e){window.showModal('تعذر حفظ الصفحة: '+e.message);}
    };
    async function publishProfiles(people){
        if(!config().enabled)return;
        if(!config().name)throw Error('أكمل مسمى المسابقة في قسم تصميم بيانات المسابقة.');
        if(location.protocol==='file:')throw Error('نشر صفحات QR يحتاج فتح النسخة المنشورة للبرنامج. صدّر نسخة قاعدة البيانات ثم استعدها في النسخة المنشورة.');
        for(const person of people){
            const data=profileData(person),key=fingerprint(data);
            if(published.get(data.token)===key)continue;
            if(data.photo?.startsWith('data:'))data.photo=await compactImage(data.photo,400);
            const response=await fetch('/api/card-profiles/'+data.token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
            if(!response.ok){const detail=await response.text();throw Error('تعذر نشر صفحة '+person.name+': '+detail.slice(0,150));}
            published.set(data.token,key);
        }
        await window.quranArchiveStorage('application_state',JSON.parse(JSON.stringify(window.appState)));
    }
    window.publishCompetitionProfiles=async function(){
        try{if(!await window.saveCompetitionDesign())return;if(!config().enabled)throw Error('فعّل رمز QR أولاً.');message('جارٍ نشر صفحات القائمة الحالية...');await publishProfiles(window.getActiveCardList());message('تم نشر صفحات '+window.getActiveCardList().length+' مشارك وربط QR بكل بطاقة.');}
        catch(e){message(e.message);window.showModal(e.message);}
    };
    for(const method of ['exportAllCardsPDF','exportAllCardsZip','printAllCards','confirmAndTriggerSystemPrint','exportSingleCard','printSingleCardDirect']){
        const original=window[method];if(!original)continue;
        window[method]=async function(...args){
            try{
                let people=window.getActiveCardList();
                if(['exportSingleCard','printSingleCardDirect'].includes(method)||method==='confirmAndTriggerSystemPrint'&&window.cardPreviewMode==='single')people=people.filter(p=>String(p.id)===String($('card-participant-select')?.value));
                if(config().enabled)await saveDraftProfiles(people);
                message('معاينة وتصدير محليان؛ روابط QR لا تعمل على الهاتف قبل نشر الصفحات.');return original.apply(this,args);
            }catch(e){window.showModal(e.message);}
        };
    }
    const originalAll=window.renderAll;
    window.renderAll=function(...args){const result=originalAll.apply(this,args);loadControls();return result;};
    function loadControls(){
        const c=config();
        for(const [key,id] of [['name','competition-name'],['hotelName','competition-hotel-name'],['hotelAddress','competition-hotel-address'],['hotelURL','competition-hotel-url'],['country','competition-country'],['contacts','competition-contacts']])if($(id))$(id).value=c[key]||'';
        for(const [key,id,value] of [['qrSize','competition-qr-size',19],['qrRight','competition-qr-right',3],['qrBottom','competition-qr-bottom',3],['qrColor','competition-qr-color','#000000'],['qrBackground','competition-qr-background','#ffffff'],['pageBackground','competition-page-background','#f3f5f3']])if($(id))$(id).value=c[key]??value;
        if($('competition-qr-label'))$('competition-qr-label').checked=!!c.qrLabel;
        if($('competition-enable-qr'))$('competition-enable-qr').checked=!!c.enabled;
        if($('card-show-qr'))$('card-show-qr').checked=!!c.enabled;
        if(c.logo){$('competition-logo-preview').src=c.logo;$('competition-logo-preview').classList.remove('hidden');}
        if($('competition-site-link')&&window.competitionSiteOrigin)$('competition-site-link').href=window.competitionSiteOrigin;
    }
    window.addEventListener('DOMContentLoaded',()=>{loadControls();void window.quranArchiveStorage('competition_profile_drafts').then(saved=>{drafts=Array.isArray(saved)?saved:[];renderDraftList();}).catch(e=>message('تعذر قراءة المسودات: '+e.message));});
})();
