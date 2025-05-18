import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))  # DON'T CHANGE THIS !!!

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
import discord
from discord.ext import commands
import asyncio
import random
import threading
import time
import json
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = 'discord_bot_controller_secret'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
socketio = SocketIO(app, cors_allowed_origins="*")

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Global variables
bot_instances = {}
current_bot = None
current_guild = None

# Discord bot class
class DiscordBot:
    def __init__(self, token):
        self.token = token
        self.bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())
        self.is_ready = False
        self.guilds = []
        
        # Register events
        @self.bot.event
        async def on_ready():
            self.is_ready = True
            self.guilds = [{'id': guild.id, 'name': guild.name, 'memberCount': len(guild.members), 
                           'icon': str(guild.icon.url) if guild.icon else None} for guild in self.bot.guilds]
            print(f'Bot logged in as {self.bot.user.name}')
    
    async def start_bot(self):
        try:
            await self.bot.start(self.token)
        except discord.errors.LoginFailure:
            return False
        except Exception as e:
            print(f"Error starting bot: {e}")
            return False
        return True
    
    async def close(self):
        if self.bot:
            await self.bot.close()
    
    def get_guild(self, guild_id):
        return self.bot.get_guild(int(guild_id))
    
    async def create_channels(self, guild, count, name, delete_old=False):
        if delete_old:
            for channel in guild.channels:
                try:
                    await channel.delete()
                    yield {'progress': 0, 'message': f'Deleted channel: {channel.name}'}
                except Exception as e:
                    print(f"Error deleting channel: {e}")
        
        total = int(count)
        for i in range(total):
            try:
                await guild.create_text_channel(f"{name}-{i+1}")
                progress = int((i + 1) / total * 100)
                yield {'progress': progress, 'message': f'Created channel {i+1}/{total}'}
            except Exception as e:
                print(f"Error creating channel: {e}")
        
        yield {'progress': 100, 'message': f'Created {total} channels'}
    
    async def create_roles(self, guild, count, name, delete_old=False):
        if delete_old:
            for role in guild.roles:
                if role.name != "@everyone":
                    try:
                        await role.delete()
                        yield {'progress': 0, 'message': f'Deleted role: {role.name}'}
                    except Exception as e:
                        print(f"Error deleting role: {e}")
        
        total = int(count)
        for i in range(total):
            try:
                # Generate random color
                color = discord.Color.from_rgb(
                    random.randint(0, 255),
                    random.randint(0, 255),
                    random.randint(0, 255)
                )
                
                # Create role with admin permissions if first role
                if i == 0:
                    await guild.create_role(name=f"{name}-{i+1}", color=color, permissions=discord.Permissions.all())
                else:
                    await guild.create_role(name=f"{name}-{i+1}", color=color)
                
                progress = int((i + 1) / total * 100)
                yield {'progress': progress, 'message': f'Created role {i+1}/{total}'}
            except Exception as e:
                print(f"Error creating role: {e}")
        
        yield {'progress': 100, 'message': f'Created {total} roles'}
    
    async def spam_channels(self, guild, message, count):
        channels = guild.text_channels
        total_messages = len(channels) * int(count)
        sent_count = 0
        
        for channel in channels:
            for i in range(int(count)):
                try:
                    await channel.send(message)
                    sent_count += 1
                    progress = int(sent_count / total_messages * 100)
                    yield {'progress': progress, 'message': f'Sent {sent_count}/{total_messages} messages'}
                except Exception as e:
                    print(f"Error sending message: {e}")
        
        yield {'progress': 100, 'message': f'Sent {sent_count} messages to {len(channels)} channels'}
    
    async def spam_dms(self, guild, message):
        members = guild.members
        total = len(members)
        sent_count = 0
        
        for i, member in enumerate(members):
            if not member.bot:
                try:
                    await member.send(message)
                    sent_count += 1
                except Exception as e:
                    print(f"Error sending DM to {member.name}: {e}")
            
            progress = int((i + 1) / total * 100)
            yield {'progress': progress, 'message': f'Sent DMs to {sent_count}/{total} members'}
        
        yield {'progress': 100, 'message': f'Sent DMs to {sent_count} members'}
    
    async def update_server(self, guild, name=None, icon=None):
        try:
            await guild.edit(name=name if name else guild.name, icon=icon if icon else guild.icon)
            return True
        except Exception as e:
            print(f"Error updating server: {e}")
            return False
    
    async def kick_all_members(self, guild):
        members = guild.members
        total = len(members)
        kicked_count = 0
        
        for i, member in enumerate(members):
            if not member.bot and member.id != guild.owner_id and member != self.bot.user:
                try:
                    await member.kick(reason="Mass kick requested")
                    kicked_count += 1
                except Exception as e:
                    print(f"Error kicking {member.name}: {e}")
            
            progress = int((i + 1) / total * 100)
            yield {'progress': progress, 'message': f'Kicked {kicked_count}/{total} members'}
        
        yield {'progress': 100, 'message': f'Kicked {kicked_count} members'}
    
    async def get_channels(self, guild):
        return [{'id': channel.id, 'name': channel.name} for channel in guild.text_channels]
    
    async def get_roles(self, guild):
        return [{'id': role.id, 'name': role.name, 'color': str(role.color)} for role in guild.roles if role.name != "@everyone"]
    
    async def get_server_info(self, guild):
        return {
            'name': guild.name,
            'icon': str(guild.icon.url) if guild.icon else None,
            'memberCount': len(guild.members)
        }

# Routes
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/upload_avatar', methods=['POST'])
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'})
    
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'})
    
    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Update server icon
        if current_bot and current_guild:
            with open(filepath, 'rb') as image:
                icon_bytes = image.read()
                
                async def update_icon():
                    guild = current_bot.get_guild(current_guild)
                    if guild:
                        await current_bot.update_server(guild, icon=icon_bytes)
                
                asyncio.run_coroutine_threadsafe(update_icon(), bot_loop)
        
        return jsonify({'success': True, 'filepath': filepath})
    
    return jsonify({'success': False, 'message': 'Failed to upload file'})

# Socket.IO events
@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('authenticate')
def handle_authenticate(data):
    global current_bot
    token = data.get('token')
    
    if not token:
        emit('auth_error', {'message': 'No token provided'})
        return
    
    # Check if bot already exists
    if token in bot_instances:
        current_bot = bot_instances[token]
        if current_bot.is_ready:
            emit('auth_success', {'servers': current_bot.guilds})
            return
    
    # Create new bot instance
    bot = DiscordBot(token)
    
    # Start bot in a separate thread
    def start_bot_thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        global bot_loop
        bot_loop = loop
        
        try:
            loop.run_until_complete(bot.start_bot())
        except Exception as e:
            print(f"Error in bot thread: {e}")
            emit('auth_error', {'message': str(e)})
    
    bot_thread = threading.Thread(target=start_bot_thread)
    bot_thread.daemon = True
    bot_thread.start()
    
    # Wait for bot to be ready
    timeout = 30  # seconds
    start_time = time.time()
    while not bot.is_ready and time.time() - start_time < timeout:
        time.sleep(0.5)
    
    if bot.is_ready:
        bot_instances[token] = bot
        current_bot = bot
        emit('auth_success', {'servers': bot.guilds})
    else:
        emit('auth_error', {'message': 'Failed to connect to Discord. Please check your token.'})

@socketio.on('logout')
def handle_logout():
    global current_bot, current_guild
    current_bot = None
    current_guild = None

@socketio.on('select_server')
def handle_select_server(data):
    global current_guild
    server_id = data.get('server_id')
    
    if not current_bot:
        emit('operation_error', {'message': 'Not authenticated'})
        return
    
    guild = current_bot.get_guild(server_id)
    if guild:
        current_guild = server_id
        emit('server_selected', {'server_name': guild.name})
    else:
        emit('operation_error', {'message': 'Server not found'})

@socketio.on('get_rooms')
def handle_get_rooms():
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    async def get_channels():
        guild = current_bot.get_guild(current_guild)
        if guild:
            channels = await current_bot.get_channels(guild)
            emit('rooms_list', {'rooms': channels})
    
    asyncio.run_coroutine_threadsafe(get_channels(), bot_loop)

@socketio.on('get_roles')
def handle_get_roles():
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    async def get_roles():
        guild = current_bot.get_guild(current_guild)
        if guild:
            roles = await current_bot.get_roles(guild)
            emit('roles_list', {'roles': roles})
    
    asyncio.run_coroutine_threadsafe(get_roles(), bot_loop)

@socketio.on('get_server_info')
def handle_get_server_info():
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    async def get_info():
        guild = current_bot.get_guild(current_guild)
        if guild:
            info = await current_bot.get_server_info(guild)
            emit('server_info', info)
    
    asyncio.run_coroutine_threadsafe(get_info(), bot_loop)

@socketio.on('create_rooms')
def handle_create_rooms(data):
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    count = data.get('count', 10)
    name = data.get('name', 'new-channel')
    delete_old = data.get('delete_old', False)
    
    async def create_channels_task():
        guild = current_bot.get_guild(current_guild)
        if guild:
            async for progress_data in current_bot.create_channels(guild, count, name, delete_old):
                emit('operation_progress', progress_data)
            
            channels = await current_bot.get_channels(guild)
            emit('rooms_list', {'rooms': channels})
            emit('operation_complete', {'message': f'Created {count} channels'})
    
    asyncio.run_coroutine_threadsafe(create_channels_task(), bot_loop)

@socketio.on('delete_room')
def handle_delete_room(data):
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    room_id = data.get('room_id')
    
    async def delete_room_task():
        guild = current_bot.get_guild(current_guild)
        if guild:
            channel = guild.get_channel(int(room_id))
            if channel:
                await channel.delete()
                channels = await current_bot.get_channels(guild)
                emit('rooms_list', {'rooms': channels})
                emit('operation_complete', {'message': f'Deleted channel {channel.name}'})
            else:
                emit('operation_error', {'message': 'Channel not found'})
    
    asyncio.run_coroutine_threadsafe(delete_room_task(), bot_loop)

@socketio.on('create_roles')
def handle_create_roles(data):
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    count = data.get('count', 10)
    name = data.get('name', 'new-role')
    delete_old = data.get('delete_old', False)
    
    async def create_roles_task():
        guild = current_bot.get_guild(current_guild)
        if guild:
            async for progress_data in current_bot.create_roles(guild, count, name, delete_old):
                emit('operation_progress', progress_data)
            
            roles = await current_bot.get_roles(guild)
            emit('roles_list', {'roles': roles})
            emit('operation_complete', {'message': f'Created {count} roles'})
    
    asyncio.run_coroutine_threadsafe(create_roles_task(), bot_loop)

@socketio.on('delete_role')
def handle_delete_role(data):
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    role_id = data.get('role_id')
    
    async def delete_role_task():
        guild = current_bot.get_guild(current_guild)
        if guild:
            role = guild.get_role(int(role_id))
            if role:
                await role.delete()
                roles = await current_bot.get_roles(guild)
                emit('roles_list', {'roles': roles})
                emit('operation_complete', {'message': f'Deleted role {role.name}'})
            else:
                emit('operation_error', {'message': 'Role not found'})
    
    asyncio.run_coroutine_threadsafe(delete_role_task(), bot_loop)

@socketio.on('spam_channels')
def handle_spam_channels(data):
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    message = data.get('message', 'Spam message')
    count = data.get('count', 10)
    
    async def spam_channels_task():
        guild = current_bot.get_guild(current_guild)
        if guild:
            async for progress_data in current_bot.spam_channels(guild, message, count):
                emit('operation_progress', progress_data)
            
            emit('operation_complete', {'message': 'Spam completed'})
    
    asyncio.run_coroutine_threadsafe(spam_channels_task(), bot_loop)

@socketio.on('spam_dms')
def handle_spam_dms(data):
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    message = data.get('message', 'Spam message')
    
    async def spam_dms_task():
        guild = current_bot.get_guild(current_guild)
        if guild:
            async for progress_data in current_bot.spam_dms(guild, message):
                emit('operation_progress', progress_data)
            
            emit('operation_complete', {'message': 'DM spam completed'})
    
    asyncio.run_coroutine_threadsafe(spam_dms_task(), bot_loop)

@socketio.on('update_server')
def handle_update_server(data):
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    name = data.get('name')
    
    async def update_server_task():
        guild = current_bot.get_guild(current_guild)
        if guild:
            success = await current_bot.update_server(guild, name=name)
            if success:
                info = await current_bot.get_server_info(guild)
                emit('server_info', info)
                emit('operation_complete', {'message': 'Server updated'})
            else:
                emit('operation_error', {'message': 'Failed to update server'})
    
    asyncio.run_coroutine_threadsafe(update_server_task(), bot_loop)

@socketio.on('kick_all_members')
def handle_kick_all_members():
    if not current_bot or not current_guild:
        emit('operation_error', {'message': 'No server selected'})
        return
    
    async def kick_members_task():
        guild = current_bot.get_guild(current_guild)
        if guild:
            async for progress_data in current_bot.kick_all_members(guild):
                emit('operation_progress', progress_data)
            
            emit('operation_complete', {'message': 'Kicked all members'})
    
    asyncio.run_coroutine_threadsafe(kick_members_task(), bot_loop)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
