var Discord = require("discord.js");
var client = new Discord.Client();
var config = require("./config.json");
var mutes = require("./mutes.json")
var prefix = config.general.prefix;
var fs = require("fs");
var Sequelize = require("sequelize");
var jsonfile = require("jsonfile");

client.login(config.general.token);

const sequelize = new Sequelize("database", "user", "password", {
    host: "localhost",
    dialect: "sqlite",
    logging: false,
    storage: "database.sqlite"
});

const UserDB = sequelize.define("userdb", {
    userid: {
        type: Sequelize.INTEGER,
        unique: true
    },
    username: Sequelize.TEXT,
    warnings: Sequelize.INTEGER,
    messagecount: Sequelize.INTEGER,
    accCreationTS: Sequelize.INTEGER,
    lastSeenTS: Sequelize.INTEGER,
    lastSeenChan: Sequelize.TEXT,
    lastSeenGuild: Sequelize.TEXT
});

const EvidenceDB = sequelize.define("evidencedb", {
    userid: Sequelize.INTEGER,
    CaseID: {
        type: Sequelize.TEXT,
        unique: true
    },
    typeOf: Sequelize.TEXT,
    dateAdded: Sequelize.INTEGER,
    evidenceLinks: Sequelize.TEXT,
    reason: Sequelize.TEXT
});

const PartyDB = sequelize.define("partydb", {
    partyID: {
        type: Sequelize.TEXT,
        unique: true
    },
    partyName: Sequelize.TEXT,
    ownerID: Sequelize.INTEGER,
    voiceChannelID: Sequelize.TEXT,
    textChannelID: Sequelize.TEXT,
    categoryID: Sequelize.TEXT
});

const StarboardDB = sequelize.define("starboarddb", {
    messageid: {
        type: Sequelize.TEXT,
        unique: true
    },
    adder: Sequelize.TEXT,
    time: Sequelize.INTEGER
});

exports.warnAdd = (userid) =>{
    try{
        sequelize.query(`UPDATE userdbs SET warnings = warnings + 1 WHERE userid = '${userid}'`);
        var success = true;
        return success;
    }catch(e){
        console.log(e);
        var success = false;
        return success;
    }
};

exports.sendDB = () =>{
    return UserDB;
};

exports.sendEvidenceDB = () =>{
    return EvidenceDB;
};

exports.sendPartyDB = () =>{
    return PartyDB;
}

client.on("ready", () => {
    console.log("Aegis Loaded.");
    console.log(`Prefix: ${prefix}`);
    UserDB.sync();
    EvidenceDB.sync();
    PartyDB.sync();
    StarboardDB.sync();
    
    client.commands = new Discord.Collection();
    //reads the commands folder (directory) and creates an array with the filenames of the files in there.
    const commandDirArray = fs.readdirSync("./commands");
    commandDirArray.forEach(e => {
        const commandFile = require(`./commands/${e}`);
        //adds a record of a command to the collection with key field and the exports module.
        client.commands.set(commandFile.name, commandFile);
    });

    client.user.setActivity("!!help | Don't DM me.")

    client.setInterval(() => {
        for(var i in mutes){
          var time = mutes[i].time;
          var guildID = mutes[i].guild;
          var guild = client.guilds.get(guildID);
          var member = guild.members.get(i)
          var mutedRole = guild.roles.find(role => role.name.toLowerCase() === config[guild.id].mutedrole.toLowerCase());
          var logchannel = guild.channels.get(config[guild.id].logchannels.moderator)
            if(!logchannel){
                logchannel = guild.channels.get(config[guild.id].logchannels.default)
                if(!logchannel){
                    return;
                }
            }
    
          if(Date.now() > time){
            member.removeRole(mutedRole);
    
            delete mutes[i];
            jsonfile.writeFileSync("./mutes.json", mutes, {spaces:4}, function(err){
              if(err){
                console.log(err);
              }else{
                console.log("Mute removed.");
              }
            })
    
            const embed = new Discord.RichEmbed()
              .addField("User unmuted", member.displayName)
              .setColor("#00C597")
              .setFooter("AEGIS-MUTE-EXPIRE Event")
              .setTimestamp(new Date())
            logchannel.send(`Mute expired for **${member.user.tag}**`, {embed})
          }
        }
      }, 3000);
});

client.on("message", message => {

    if(message.channel.type == "dm") return;

    UserDB.create({
        userid: message.author.id,
        username: message.author.tag,
        warnings: 0,
        messagecount: 1,
        accCreationTS: message.author.createdTimestamp,
        lastSeenTS: message.createdTimestamp,
        lastSeenChan: message.channel.name,
        lastSeenGuild: message.guild.name
    }).catch(Sequelize.ValidationError, function (err) {
        //UserDB.update({messagecount: messagecount + 1}, {where: {userid: message.author.id}});
        sequelize.query(`UPDATE userdbs SET messagecount = messagecount + 1 WHERE userid = '${message.author.id}'`);
        UserDB.update({lastSeenTS: message.createdTimestamp}, {where: {userid: message.author.id}});
        UserDB.update({lastSeenChan: message.channel.name}, {where: {userid: message.author.id}});
        UserDB.update({lastSeenGuild: message.guild.name}, {where: {userid: message.author.id}});
    });
      
    if(!message.content.startsWith(prefix) || message.author.id == client.user.id) return;

    const args = message.content.slice(prefix.length).split(" ");
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.alias && cmd.alias.includes(commandName));

    if(config[message.guild.id].disabledCommands.indexOf(commandName) != -1){
        return message.reply("That command has been disabled by your server administrators.")
    }
    try{
        command.execute(message, args, prefix, client, Discord);
    }catch(error){
        console.error(error);
        const embed = new Discord.RichEmbed()
            .addField("An Error Occured.", error.message)
            .setTimestamp(new Date())
            .setColor("#ff0000");
        message.channel.send({embed});
    }    
});

client.on("messageDelete", message => {
    var mcontent = message.content;
    if(mcontent.length > 1023){
        mcontent = "ERR: Message Content too long to post."
    }

    if(config[message.guild.id].disabledLogs.indexOf("messageDelete") != -1){
        return;
    }
    var logchannel = message.guild.channels.get(config[message.guild.id].logchannels.default);
        if(!logchannel){
            return;
        }

    if(!mcontent){
        mcontent = "I could not find any content. This may have been an image post.";
    }
    const embed = new Discord.RichEmbed()
        .setColor("#C50000")
        .setTimestamp(new Date())
        .setFooter("AEGIS-DELETE Event")
        .addField("Their UserID is", message.author.id)
        .addField("The message content was", mcontent)
        .addField("The channel was", "#" + message.channel.name)
    logchannel.send(`**${message.author.tag}**'s message was deleted!`, {embed});
});

client.on("messageUpdate", (oldMessage, newMessage) => {
    if(oldMessage.content.length == 0 || oldMessage.author.id === client.user.id || oldMessage.content == newMessage.content || oldMessage.content.length > 1023 || newMessage.content.length > 1023){
        return;
      }else if(newMessage.content.length == 0 || newMessage.author.id === client.user.id){
        return;
      }else if(config[newMessage.guild.id].disabledLogs.indexOf("messageUpdate") != -1){
        return;
      }
      var guild = newMessage.guild;
      var embed = new Discord.RichEmbed()
        .addField("Ther ID is", `${newMessage.author.id}`, false)
        .addField("Old Message Content", oldMessage.content, false)
        .addField("New Message Content", newMessage.content, false)
        .addField("The channel is", "#" + newMessage.channel.name)
        .setColor("#C3C500")
        .setTimestamp(new Date())
        .setFooter("AEGIS-EDIT Event");
    
        var logchannel = guild.channels.get(config[guild.id].logchannels.default);
        if(!logchannel){
            return;
        }
        var userTagForMessage = newMessage.author.tag;
        if(!userTagForMessage){
          userTagForMessage = oldMessage.author.tag;
        }
        logchannel.send(`**${userTagForMessage}**'s message was edited!`, {embed});    
});

client.on("messageDeleteBulk", messages =>{
    var logchannel = messages.first().guild.channels.get(config[messages.first().guild.id].logchannels.default);
    if(!logchannel){
            return;
    }else if(config[messages.first().guild.id].disabledLogs.indexOf("messageDeleteBulk") != -1){
        return;
      }
    const embed = new Discord.RichEmbed()
        .addField("Bulk Delete Log", `${messages.size} messages bulk deleted from #${messages.first().channel.name}`)
        .setColor("#C50000")
        .setTimestamp(new Date())
        .setFooter("AEGIS-BULK-DELETE Event");
    var i = 0
    if(messages.size < 25){
        messages.forEach(element => {
            var content = element.content
            if(!element.content){content = "No Content"}
            i++;
            embed.addField(`Message: ${i} - ${element.author.tag}`, content);
        });
    }else{
        embed.addField("Could not add message information.", "Bulk Delete exceeded 25 fields.");
    }
   
    logchannel.send({embed})
});

client.on("guildCreate", guild =>{
    const embed = new Discord.RichEmbed()
        .addField("Welcome to the Aegis Community!", "Thanks for adding Aegis!")
        .addField("If you need assistance, the best place to get it is on the offical support hub", "https://discord.gg/9KpYRme")
        .setColor("#30167c");
    try {
        var logchannelIDFinder = guild.channels.find("name", "log-channel").id;
    } catch (error) {
        guild.createChannel("log-channel", "text").then(chan => {
            logchannelIDFinder = chan.id;
            embed.addField("To start off, I have created a channel named log-channel where all my message logs will go.", "Feel free to set permissions for this channel, as long as I have the ability to READ_MESSAGES and SEND_MESSAGES!");
        });
    }

    if(!config[guild.id]){
      config[guild.id] = {
            "name": guild.name,
            "owner": guild.owner.id,
            "disabledCommands": "",
            "disabledLogs": "",
            "logchannels": {
                "default": logchannelIDFinder,
                "moderation": "",
                "voice": "",
                "migration": ""
            },
            "mutedrole": "muted"
      }
  
      jsonfile.writeFile("config.json", config, {spaces: 4}, err =>{
        if(!err){
            guild.owner.send({embed}).catch(console.log);
        }else{
            console.log(err);
        }
      })
    }else{
      return
    }
});

client.on("voiceStateUpdate", (oldMember, newMember) => {
    
    var embed = new Discord.RichEmbed();
    var guild = oldMember.guild
    var user = newMember.user

    if(config[guild.id].disabledLogs.indexOf("voiceStateUpdate") != -1){
        return;
    }
  
      var voicelogchannel = guild.channels.get(config[guild.id].logchannels.voice)
      if(!voicelogchannel){
        voicelogchannel = guild.channels.get(config[guild.id].logchannels.default)
        if(!voicelogchannel){
            return;
        }
      };
  
      if(!user){
        user = newMember.user
      }
    if(!oldMember.voiceChannel && !newMember.voiceChannel) return;
      if(!oldMember.voiceChannel){
        embed.addField("User joined a voice channel", `${user.tag} joined ${newMember.voiceChannel.name}.`, true)
      }else if(!newMember.voiceChannel){
        embed.addField("User disconnected from voice channels", `${user.tag} left ${oldMember.voiceChannel.name}.`, true)
      }else{
        embed.setAuthor(`${user.tag} changed voice channels.`)
        if((oldMember.mute == true) || (oldMember.deaf == true) || (newMember.mute == true) || (newMember.deaf == true)){
          return;
        }else{
          embed.addField("Old channel", `${oldMember.voiceChannel.name}`, true)
          embed.addField("New channel", `${newMember.voiceChannel.name}`, true)
        }
      }
  
      embed.addField("User ID", newMember.id)
      embed.setColor(newMember.guild.member(client.user).highestRole.color)
      embed.setTimestamp(newMember.createdAt)
  
      var userTagForMessage = user.tag
      if(!userTagForMessage){
        userTagForMessage = user.tag
      }
      voicelogchannel.send(`**Voice Log Information for: **${userTagForMessage}`, {embed}).catch(console.log)
});

client.on("guildMemberRemove", member => {
    var embed = new Discord.RichEmbed()
    let guild = member.guild

    if(config[guild.id].disabledLogs.indexOf("guildMemberRemove") != -1){
        return;
    }
  
      embed.addField("User Left", member.user.username)
      embed.addField("User Discriminator", member.user.discriminator, true)
      embed.addField("User ID", member.user.id)
      embed.setTimestamp(new Date())
      embed.setColor("#C50000")
      embed.setThumbnail(member.user.avatarURL)
  
      var logchannel = guild.channels.get(config[guild.id].logchannels.migration);
        if(!logchannel){
            logchannel = guild.channels.get(config[guild.id].logchannels.default);
            if(!logchannel){
                return;
            }
        }
  
      logchannel.send(`${member.user.tag} left the server`, {embed})
});
  
client.on("guildMemberAdd", member => {
    var embed = new Discord.RichEmbed()
    let guild = member.guild
    var ruleschannel = guild.channels.find("name", "server-rules")

    if(config[guild.id].disabledLogs.indexOf("guildMemberAdd") != -1){
        return;
    }
  
      embed.addField("User Joined", member.user.username, true)
      embed.addField("User Discriminator", member.user.discriminator, true)
      embed.addField("User ID", member.user.id)
      embed.addField("User account creation date", member.user.createdAt)
      embed.setTimestamp(new Date())
      embed.setColor("#24c500")
      embed.setThumbnail(member.user.avatarURL)
  
      var logchannel = guild.channels.get(config[guild.id].logchannels.migration);
        if(!logchannel){
            logchannel = guild.channels.get(config[guild.id].logchannels.default);
            if(!logchannel){
                return;
            }
        }
      logchannel.send(`${member.user.tag} joined the server`, {embed})
});

/*client.on("messageReactionAdd", (messageReacion, user) => {
    if(messageReacion.emoji.id != ""){
        return;
    }else{
        if(config[message.guild.id].disabledCommands.indexOf("starboard") != -1) return
        var message = messageReaction.message;
        StarboardDB.create({
            messageid: message.id,
            adder: message.author.id,
            time: message.createdTimestamp
        })
        var sbChan = message.guild.channels.get(config[message.guild.id].logchannels.starboard)
        if(!sbChan)return;
        console.log("Yes")
    }
});*/