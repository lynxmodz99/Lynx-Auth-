import uuid
import secrets
import os
import sys
import requests
import asyncio
import json
import httpx
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import firebase_admin
from firebase_admin import credentials, firestore


def log_info(msg): print(f"\033[94m[INFO]\033[0m {msg}")
def log_success(msg): print(f"\033[92m[SUCCESS]\033[0m {msg}")
def log_warn(msg): print(f"\033[93m[WARNING]\033[0m {msg}")
def log_err(msg): print(f"\033[91m[ERROR]\033[0m {msg}")


try:
    env_creds = os.environ.get("SERVICE_ACCOUNT_JSON")
    
    if env_creds:
        cred_dict = json.loads(env_creds)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        log_success("Connected to Firebase via Environment Variable!")
        

    elif os.path.exists("serviceAccountKey.json"):
        with open("serviceAccountKey.json", "r") as f:
            cred_dict = json.load(f)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        log_success("Connected to Firebase Firestore via local JSON!")
        
    else:
        log_err("Firebase credentials not found (Env Var or JSON).")
        sys.exit(1)
        
except Exception as e:
    log_err(f"Failed to connect to Firebase: {e}")
    sys.exit(1)
    
app = FastAPI()

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# models
class SellerSyncRequest(BaseModel): firebase_uid: str; email: str
class SellerDeleteRequest(BaseModel): ownerid: str
class AppCreateRequest(BaseModel): ownerid: str; app_name: str
class AppDeleteRequest(BaseModel): appid: str
class EndUserCreateRequest(BaseModel): ownerid: str; appid: str; username: str; password: str; days: int; expire_str: str = None
class ApiLoginRequest(BaseModel): ownerid: str; app_secret: str; username: str; password: str; hwid: str
class UserListRequest(BaseModel): appid: str
class UserDeleteRequest(BaseModel): user_id: str
class UserExtendRequest(BaseModel): user_id: str; days: int


class WebhookSaveRequest(BaseModel): 
    appid: str
    webhook_url: str
    enabled: bool
    show_hwid: bool
    show_app: bool
    show_expiry: bool



async def send_discord_webhook(url, user_data, config, app_name, ip_address):
    if not url: return
    if "discord.com" in url: url = url.replace("discord.com", "discordapp.com")

    fields = []
    fields.append({"name": "User", "value": f"`{user_data['username']}`", "inline": True})
    if config.get('show_app'): fields.append({"name": "Application", "value": f"`{app_name}`", "inline": True})
    if config.get('show_hwid') and user_data.get('hwid'): fields.append({"name": "HWID", "value": f"```{user_data['hwid']}```", "inline": False})
    if config.get('show_expiry'):
        exp_raw = user_data.get('expires_at', 'N/A')
        exp = exp_raw.split('T')[0] if exp_raw else "N/A"
        fields.append({"name": "Expiry Date", "value": f"`{exp}`", "inline": True})

    embed = {
        "title": "Login Authenticated",
        "color": 65280,
        "fields": fields,
        "footer": {"text": "Lynx Auth System"},
        "timestamp": datetime.utcnow().isoformat()
    }

    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json", "Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json={"embeds": [embed]}, headers=headers, timeout=10)
        except Exception as e:
            log_err(f"Webhook error: {e}")



@app.post("/auth/sync")
def sync_seller(data: SellerSyncRequest):
    doc_ref = db.collection('sellers').document(data.firebase_uid)
    doc = doc_ref.get()
    
    if doc.exists:
        d = doc.to_dict()
        existing_id = d.get('ownerid')
        return {
            "status": "success", 
            "ownerid": existing_id, 
            "coins": d.get('coins', 0), 
            "is_premium": d.get('is_premium', False)
        }
    else:
        new_ownerid = str(uuid.uuid4())
        doc_ref.set({
            'email': data.email,
            'ownerid': new_ownerid,
            'coins': 400,
            'is_premium': False,
            'created_at': firestore.SERVER_TIMESTAMP
        })
        return {"status": "success", "ownerid": new_ownerid, "coins": 400, "is_premium": False}

@app.post("/apps/create")
def create_app(data: AppCreateRequest):
    seller_query = db.collection('sellers').where('ownerid', '==', data.ownerid).limit(1).stream()
    seller_doc = next(seller_query, None)
    
    if not seller_doc: raise HTTPException(status_code=404, detail="Seller not found")
    
    seller_data = seller_doc.to_dict()
    coins = seller_data.get('coins', 0)
    
    aggregate_query = db.collection('applications').where('ownerid', '==', data.ownerid).count()
    results = aggregate_query.get()
    current_apps_count = results[0][0].value

    if current_apps_count >= 2: raise HTTPException(status_code=400, detail="Free Tier Limit: Max 2 Apps.")
    if coins < 100: raise HTTPException(status_code=400, detail="Insufficient Coins. Need 100 coins.")
    seller_doc.reference.update({'coins': coins - 100})
    
    appid = str(uuid.uuid4())
    app_secret = secrets.token_hex(16)
    
    db.collection('applications').add({
        'appid': appid,
        'app_secret': app_secret,
        'name': data.app_name,
        'ownerid': data.ownerid,
        'created_at': firestore.SERVER_TIMESTAMP
    })
    
    return {"status": "success", "appid": appid, "app_secret": app_secret}

@app.post("/apps/list")
def list_apps(data: dict):
    ownerid = data.get("ownerid")
    apps_ref = db.collection('applications').where('ownerid', '==', ownerid).stream()
    apps_list = []
    for doc in apps_ref:
        d = doc.to_dict()
        apps_list.append({
            "name": d['name'], 
            "appid": d['appid'], 
            "app_secret": d['app_secret'],
            "webhook_config": d.get('webhook_config', {}) 
        })
    return {"status": "success", "apps": apps_list}

@app.post("/apps/delete")
def delete_app(data: AppDeleteRequest):

    apps = db.collection('applications').where('appid', '==', data.appid).limit(1).stream()
    app_doc = next(apps, None)
    
    if not app_doc:
        raise HTTPException(status_code=404, detail="App not found")


    batch = db.batch()
    users = db.collection('users').where('appid', '==', data.appid).stream()
    count = 0
    
    for u in users:
        batch.delete(u.reference)
        count += 1
        # if count >=500:
              #batch.commit()
              #batch = db.batch()
              #count = 2
        if count >= 450:
            batch.commit()
            batch = db.batch()
            count = 0
            

    batch.delete(app_doc.reference)
    batch.commit()
    
    return {"status": "success"}

@app.post("/users/create")
def create_end_user(data: EndUserCreateRequest):
    seller_query = db.collection('sellers').where('ownerid', '==', data.ownerid).limit(1).stream()
    seller_doc = next(seller_query, None)
    if not seller_doc: raise HTTPException(status_code=404, detail="Seller error")
    
    my_apps = [a.get('appid') for a in db.collection('applications').where('ownerid', '==', data.ownerid).stream()]
    if not my_apps: raise HTTPException(status_code=400, detail="No apps found")
    
    total_users = 0
    for aid in my_apps:
        agg = db.collection('users').where('appid', '==', aid).count()
        total_users += agg.get()[0][0].value
        
    if total_users >= 40: raise HTTPException(status_code=400, detail="Free Tier Limit: Max 40 Users Total.")

    dupes = db.collection('users').where('appid', '==', data.appid).where('username', '==', data.username).limit(1).stream()
    for _ in dupes: raise HTTPException(status_code=400, detail="Username exists")

    if data.expire_str:
        expires = datetime.strptime(data.expire_str, "%Y-%m-%dT%H:%M")
    elif data.days == 0: 
        expires = datetime(9999, 12, 31)
    else: 
        expires = datetime.utcnow() + timedelta(days=data.days)

    db.collection('users').add({
        'appid': data.appid,
        'username': data.username,
        'password': data.password,
        'expires_at': expires.isoformat(),
        'hwid': None
    })
    return {"status": "success"}

@app.post("/users/list")
def list_users(data: UserListRequest):
    users = db.collection('users').where('appid', '==', data.appid).stream()
    u_list = [{"id": d.id, **d.to_dict()} for d in users]
    return {"status": "success", "users": u_list}

@app.post("/users/delete")
def delete_user(data: UserDeleteRequest):
    db.collection('users').document(data.user_id).delete()
    return {"status": "success"}

@app.post("/api/1.0/user_login")
async def user_login(data: ApiLoginRequest, request: Request, bg_tasks: BackgroundTasks):
    # apps load 
    apps = db.collection('applications').where('ownerid', '==', data.ownerid).where('app_secret', '==', data.app_secret).limit(1).stream()
    app_doc_ref = next(apps, None)
    if not app_doc_ref: return {"success": False, "message": "Invalid application details."}
    app_data = app_doc_ref.to_dict()

          # users load 
    users = db.collection('users').where('username', '==', data.username).where('appid', '==', app_data['appid']).limit(1).stream()
    user_doc = next(users, None)
    if user_doc is None: return {"success": False, "message": "Invalid credentials."}
    
    u_data = user_doc.to_dict()
    if u_data['password'] != data.password: return {"success": False, "message": "Invalid credentials."}


    try:
        expiry_date = datetime.fromisoformat(u_data['expires_at'])
        
        if datetime.utcnow() > expiry_date:
            return {"success": False, "message": "Your subscription has expired."}
    except Exception as e:
        log_err(f"Expiry check error: {e}")
        return {"success": False, "message": "Error verifying subscription status."}
    
    u_data = user_doc.to_dict()
    if u_data['password'] != data.password: return {"success": False, "message": "Invalid credentials."}
    
    is_hwid_locked = u_data.get('hwid_locked', True)

    if is_hwid_locked:
        if u_data.get('hwid') is None:
            user_doc.reference.update({'hwid': data.hwid})
            u_data['hwid'] = data.hwid 
        elif u_data['hwid'] != data.hwid:
            return {"success": False, "message": "HWID mismatch."}
    else:
        user_doc.reference.update({'hwid': data.hwid})
        u_data['hwid'] = data.hwid
    
    wh_config = app_data.get('webhook_config', {})
    if wh_config.get('enabled') and wh_config.get('url'):
        x_forwarded_for = request.headers.get("x-forwarded-for")
        client_ip = x_forwarded_for.split(',')[0] if x_forwarded_for else request.client.host
        bg_tasks.add_task(send_discord_webhook, wh_config['url'], u_data, wh_config, app_data['name'], client_ip)

    return {"success": True, "message": "Login successful.", "info": {"expires": u_data['expires_at']}}

# /seller/delete endpoint is disabled in the opensource build.
# @app.post("/seller/delete")
# def delete_seller(data: SellerDeleteRequest):
#     db.collection('sellers').where('ownerid', '==', data.ownerid).limit(1).get()[0].reference.delete()
#     apps = db.collection('applications').where('ownerid', '==', data.ownerid).stream()
#     for a in apps:
#         users = db.collection('users').where('appid', '==', a.get('appid')).stream()
#         for u in users: u.reference.delete()
#         a.reference.delete()
#     return {"status": "success"}

@app.post("/apps/webhook/save")
def save_webhook(data: WebhookSaveRequest):
    apps = db.collection('applications').where('appid', '==', data.appid).limit(1).stream()
    found = False
    for a in apps:
        a.reference.update({
            'webhook_config': {
                'url': data.webhook_url,
                'enabled': data.enabled,
                'show_hwid': data.show_hwid,
                # 'show_ip': data.show_ip,
                'show_app': data.show_app,
                'show_expiry': data.show_expiry
            }
        })
        found = True
    if found: return {"status": "success"}
    raise HTTPException(status_code=404, detail="App not found")




class UserUpdateAction(BaseModel):
    user_id: str
    action: str 
    expire_str: str = None 
    lock_state: bool = False


@app.post("/users/action")
def user_action(data: UserUpdateAction):
    doc_ref = db.collection('users').document(data.user_id)
    doc = doc_ref.get()
    
    if not doc.exists: 
        raise HTTPException(status_code=404, detail="User not found")
    
    updates = {}

    if data.action == "reset_hwid":
        updates['hwid'] = None
    
    elif data.action == "toggle_lock":
        updates['hwid_locked'] = data.lock_state

    elif data.action == "set_expiry":
        if data.expire_str:
            updates['expires_at'] = data.expire_str

    if updates:
        doc_ref.update(updates)
        return {"status": "success"}
    
    return {"status": "no_change"}


@app.api_route("/", methods=["GET", "HEAD"])
def health_check():
    return {"status": "active", "timestamp": datetime.utcnow().isoformat()}



# Author : lynx
# Rights : lynxauth.qzz.io | lynxmodz.qzz.io
# open source release 2026 lynx auth
# legal notice : this source is open to all , don't use it for selling purpose or claim as your own work. 