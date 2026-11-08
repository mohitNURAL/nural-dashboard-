// The Pulse sign-in page (2026-11-02): email and password, Create account and Forgot password
// (a code mailed to the work email), and Sign in with Bitrix24. Served by the API at
// /api/auth/signin, outside the web app (which needs a session to load).

export function signinPage(opts: {
  notice?: 'expired' | 'out';
  domains: string[];
  minPassword: number;
  sessionDays: number;
}) {
  const domain = opts.domains[0] ?? 'nuraltech.com';
  const notice =
    opts.notice === 'expired'
      ? `Your session ended. For security you are signed out ${opts.sessionDays} days after signing in.`
      : opts.notice === 'out'
        ? 'You are signed out.'
        : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Nural Pulse</title>
<link rel="icon" href="/brand/pulse-symbol-primary.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Work+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--navy:#18244e;--blue:#32499f;--blue-d:#283b80;--ink:#231f20;--mute:#6b6567;--line:#dfddde;--bg:#f8f9fd;--err:#c0392b;--ok:#13795b}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 'Work Sans',system-ui,sans-serif;padding:24px 16px}
main{width:100%;max-width:400px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:28px 28px 24px;box-shadow:0 4px 18px rgba(24,36,78,.06)}
.logo{display:block;height:34px;margin:0 auto 20px}
h1{font:800 20px Manrope,sans-serif;color:var(--navy);margin:0 0 4px}
.sub{color:var(--mute);margin:0 0 20px;font-size:14px}
label{display:block;font:700 13px Manrope,sans-serif;color:var(--navy);margin:14px 0 6px}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:6px;font:inherit;color:inherit;background:#fff}
input:focus{outline:2px solid var(--blue);outline-offset:-1px;border-color:var(--blue)}
.btn{display:block;width:100%;margin-top:18px;padding:11px 16px;border:0;border-radius:6px;background:var(--blue);color:#fff;font:700 15px Manrope,sans-serif;cursor:pointer;text-align:center;text-decoration:none}
.btn:hover{background:var(--blue-d)}.btn[disabled]{opacity:.6;cursor:wait}
.btn.alt{background:#fff;color:var(--navy);border:1px solid var(--line)}.btn.alt:hover{background:#f1f3fa}
.links{display:flex;justify-content:space-between;gap:12px;margin-top:14px;font-size:14px}
.links a,.link{color:var(--blue);text-decoration:none;cursor:pointer;background:none;border:0;padding:0;font:inherit}
.links a:hover,.link:hover{text-decoration:underline}
.or{display:flex;align-items:center;gap:10px;color:var(--mute);font-size:13px;margin:20px 0 0}
.or:before,.or:after{content:"";flex:1;height:1px;background:var(--line)}
.msg{margin:14px 0 0;font-size:14px;min-height:0}.msg.err{color:var(--err)}.msg.ok{color:var(--ok)}
.notice{background:#eef1fa;color:var(--navy);border-radius:6px;padding:10px 12px;font-size:14px;margin:0 0 16px}
.hint{color:var(--mute);font-size:13px;margin:6px 0 0}
.foot{margin-top:16px;font-size:12px;color:#8b91a8;text-align:center}
[hidden]{display:none!important}
</style></head>
<body><main>
<div class="card">
<img class="logo" src="/brand/pulse-lockup-primary.svg" alt="Nural Pulse">
${notice ? `<p class="notice">${notice}</p>` : ''}

<form id="signin">
<h1>Sign in</h1>
<p class="sub">With your Nural work email and Pulse password.</p>
<label for="si-email">Work email</label>
<input id="si-email" type="email" autocomplete="username" placeholder="name@${domain}" required>
<label for="si-pass">Password</label>
<input id="si-pass" type="password" autocomplete="current-password" required>
<button class="btn" type="submit">Sign in</button>
<p class="msg" role="alert"></p>
<div class="links"><a data-go="create">Create account</a><a data-go="reset">Forgot password?</a></div>
</form>

<form id="code" hidden>
<h1 data-title></h1>
<p class="sub">We will mail a 6-digit code to your Nural work email (@${domain}) to confirm it is you.</p>
<label for="c-email">Work email</label>
<input id="c-email" type="email" autocomplete="username" placeholder="name@${domain}" required>
<p class="hint">The email on your Nural Bitrix24 profile.</p>
<button class="btn" type="submit">Send code</button>
<p class="msg" role="alert"></p>
<div class="links"><a data-go="signin">Back to sign in</a></div>
</form>

<form id="set" hidden>
<h1 data-title></h1>
<p class="sub" data-sent></p>
<label for="s-code">Code from the mail</label>
<input id="s-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" pattern="[0-9 ]{6,7}" required>
<label for="s-pass">New password</label>
<input id="s-pass" type="password" autocomplete="new-password" minlength="${opts.minPassword}" required>
<p class="hint">At least ${opts.minPassword} characters.</p>
<label for="s-pass2">Password again</label>
<input id="s-pass2" type="password" autocomplete="new-password" minlength="${opts.minPassword}" required>
<button class="btn" type="submit">Save and sign in</button>
<p class="msg" role="alert"></p>
<div class="links"><button type="button" class="link" data-resend>Send a new code</button><a data-go="signin">Back to sign in</a></div>
</form>

<form id="change" hidden>
<h1>Choose your password</h1>
<p class="sub">You signed in with a temporary password from an admin. Choose your own to continue.</p>
<label for="ch-pass">New password</label>
<input id="ch-pass" type="password" autocomplete="new-password" minlength="${opts.minPassword}" required>
<p class="hint">At least ${opts.minPassword} characters.</p>
<label for="ch-pass2">Password again</label>
<input id="ch-pass2" type="password" autocomplete="new-password" minlength="${opts.minPassword}" required>
<button class="btn" type="submit">Save and sign in</button>
<p class="msg" role="alert"></p>
<div class="links"><a data-go="signin">Back to sign in</a></div>
</form>

<div class="or">or</div>
<a class="btn alt" href="/api/auth/login">Sign in with Bitrix24</a>
<p class="hint" style="text-align:center">Needed to change tasks from Pulse.</p>
</div>
<p class="foot">Powered by <b>Bitrix24</b> and <b>Nural</b></p>
</main>
<script>
(function(){
  var forms={signin:document.getElementById('signin'),code:document.getElementById('code'),set:document.getElementById('set'),change:document.getElementById('change')};
  var temp='';
  var mode='create', email='';
  var titles={create:'Create your Pulse account',reset:'Set a new password'};
  function show(name){
    for(var k in forms) forms[k].hidden=k!==name;
    document.querySelectorAll('[data-title]').forEach(function(h){h.textContent=titles[mode]});
    document.querySelectorAll('.msg').forEach(function(m){m.textContent='';m.className='msg'});
    var first=forms[name].querySelector('input'); if(first) first.focus();
  }
  function say(form,text,ok){var m=form.querySelector('.msg');m.textContent=text;m.className='msg '+(ok?'ok':'err')}
  function post(path,body){
    return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {ok:r.ok,body:j}})})
      .catch(function(){return {ok:false,body:{error:'No connection. Try again.'}}});
  }
  function busy(form,on){var b=form.querySelector('button[type=submit]');b.disabled=on}
  document.querySelectorAll('[data-go]').forEach(function(a){
    a.setAttribute('href','#');
    a.addEventListener('click',function(e){e.preventDefault();var g=a.getAttribute('data-go');
      if(g==='signin') return show('signin');
      mode=g; var e1=document.getElementById('si-email').value; if(e1) document.getElementById('c-email').value=e1; show('code');});
  });
  forms.signin.addEventListener('submit',function(e){
    e.preventDefault(); busy(forms.signin,true);
    post('/api/auth/password-login',{email:document.getElementById('si-email').value,password:document.getElementById('si-pass').value})
      .then(function(r){busy(forms.signin,false);
        if(r.ok&&r.body.change){temp=document.getElementById('si-pass').value;email=document.getElementById('si-email').value.trim();return show('change')}
        if(r.ok) return location.replace('/'); say(forms.signin,r.body.error||'Sign-in failed.')});
  });
  forms.change.addEventListener('submit',function(e){
    e.preventDefault();
    var p1=document.getElementById('ch-pass').value,p2=document.getElementById('ch-pass2').value;
    if(p1!==p2) return say(forms.change,'The two passwords are not the same.');
    busy(forms.change,true);
    post('/api/auth/password-change',{email:email,password:temp,newPassword:p1})
      .then(function(r){busy(forms.change,false); if(r.ok){temp='';return location.replace('/')} say(forms.change,r.body.error||'Could not save the password.')});
  });
  function sendCode(form){
    busy(form,true);
    return post('/api/auth/code',{email:email}).then(function(r){busy(form,false);return r});
  }
  forms.code.addEventListener('submit',function(e){
    e.preventDefault(); email=document.getElementById('c-email').value.trim();
    sendCode(forms.code).then(function(r){
      if(!r.ok) return say(forms.code,r.body.error||'Could not send the code.');
      show('set'); forms.set.querySelector('[data-sent]').textContent=r.body.message||'';
    });
  });
  forms.set.querySelector('[data-resend]').addEventListener('click',function(){
    sendCode(forms.set).then(function(r){say(forms.set,r.ok?'A new code is on its way.':(r.body.error||'Could not send the code.'),r.ok)});
  });
  forms.set.addEventListener('submit',function(e){
    e.preventDefault();
    var p1=document.getElementById('s-pass').value,p2=document.getElementById('s-pass2').value;
    if(p1!==p2) return say(forms.set,'The two passwords are not the same.');
    busy(forms.set,true);
    post('/api/auth/password',{email:email,code:document.getElementById('s-code').value,password:p1})
      .then(function(r){busy(forms.set,false); if(r.ok) return location.replace('/'); say(forms.set,r.body.error||'Could not save the password.')});
  });
  if(location.hash==='#create'){mode='create';show('code')}
})();
</script>
</body></html>`;
}
