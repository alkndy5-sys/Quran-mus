const APP_HTML = __APP_HTML__;
const OWNER_EMAIL = __OWNER_EMAIL__;
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageURL=value=>typeof value==='string' && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value)?value:'';
const safeLink=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}};
function profileHTML(data){
    const c=data.competition||{},logo=imageURL(c.logo),photo=imageURL(data.photo),hotel=safeLink(c.hotelURL);
    const pageBackground=/^#[0-9a-f]{6}$/i.test(c.pageBackground||'')?c.pageBackground:'#f3f5f3';
    const pageImage=imageURL(c.pageImage);
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(data.name)} — ${escape(c.name)}</title><style>body{margin:0;padding:24px;background-color:${pageBackground};${pageImage?'background-image:url("'+pageImage+'");background-size:cover;background-position:center;background-attachment:fixed;':''}font-family:Arial,sans-serif;color:#19382e}.card{max-width:460px;margin:auto;background:white;border-radius:24px;overflow:hidden;box-shadow:0 10px 40px #003d2420;text-align:center}header{background:#003d24;color:white;padding:26px}header img{max-width:150px;max-height:90px}h1{font-size:26px}h2{font-size:20px;margin:12px 0}main{padding:24px}.photo{width:108px;height:108px;border:3px solid #c5a059;border-radius:18px;object-fit:cover}section{padding:18px;margin:18px 0;background:#f9f6f0;border-radius:14px;text-align:center}a{display:inline-block;padding:10px 14px;background:#003d24;color:white;border-radius:10px;text-decoration:none}p{line-height:1.8;overflow-wrap:anywhere}.contact{white-space:pre-wrap;unicode-bidi:plaintext}</style></head><body><article class="card"><header>${logo?`<img src="${logo}" alt="شعار المسابقة">`:''}<h2>${escape(c.name)}</h2></header><main>${photo?`<img class="photo" src="${photo}" alt="صورة ${escape(data.name)}">`:''}<h1>${escape(data.name)}</h1><p>${escape(data.role)}</p><strong>${escape(data.country)}</strong><section><h2>الإقامة والفندق</h2><strong>${escape(c.hotelName)}</strong><p>${escape(c.hotelAddress)}</p><p>${escape(c.country)}</p>${hotel?`<a href="${escape(hotel)}" target="_blank" rel="noopener">فتح موقع الفندق</a>`:''}</section><section><h2>التواصل مع المسابقة</h2><p class="contact">${escape(c.contacts)}</p></section></main></article></body></html>`;
}
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"};
const authorized=request=>(request.headers.get('oai-authenticated-user-email')||'').toLowerCase()===OWNER_EMAIL;
export default {
    async fetch(request,env){
        const url=new URL(request.url),match=url.pathname.match(/^\/c\/([a-f0-9]{32})$/);
        if(match){
            if(!env.BUCKET)return new Response('خدمة صفحات المشاركين غير مهيأة',{status:503});
            const object=await env.BUCKET.get('profiles/'+match[1]+'.json');
            if(!object)return new Response('صفحة المشارك غير منشورة أو تم إلغاؤها',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
            return new Response(profileHTML(await object.json()),{headers});
        }
        if(url.pathname.startsWith('/api/card-profiles/')){
            if(!authorized(request))return new Response('يلزم الدخول بحساب مالك المسابقة',{status:403});
            const token=url.pathname.slice('/api/card-profiles/'.length);
            if(!/^[a-f0-9]{32}$/.test(token))return new Response('معرّف غير صالح',{status:400});
            if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
            if(request.headers.get('Origin')!==url.origin)return new Response('Origin not allowed',{status:403});
            if(!env.BUCKET)return new Response('التخزين غير مهيأ',{status:503});
            const text=await request.text();if(text.length>1800000)return new Response('الصورة أو الشعار أكبر من الحد المسموح',{status:413});
            let data;try{data=JSON.parse(text);}catch{return new Response('JSON غير صالح',{status:400});}
            if(data.token!==token||typeof data.name!=='string'||!data.name.trim()||!data.competition?.name)return new Response('بيانات المشارك أو المسابقة غير مكتملة',{status:400});
            if(data.photo&&!imageURL(data.photo)||data.competition.logo&&!imageURL(data.competition.logo))return new Response('صيغة الصورة أو الشعار غير مدعومة',{status:400});
            await env.BUCKET.put('profiles/'+token+'.json',JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
            return Response.json({ok:true,token});
        }
        if(url.pathname==='/'||url.pathname==='/index.html'){
            if(!authorized(request)){
                if(!request.headers.get('oai-authenticated-user-email'))return Response.redirect(url.origin+'/signin-with-chatgpt?returnTo=%2F',302);
                return new Response('هذه الواجهة خاصة بمالك المسابقة',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8'}});
            }
            return new Response(APP_HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
        }
        return new Response('Not found',{status:404});
    }
};
