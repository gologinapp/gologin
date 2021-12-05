from gologin import GoLogin


gl = GoLogin({
	"token": "yU0token",
	})

profile_id = gl.create({
    "name": 'profile_mac',
    "os": 'mac',
    "navigator": {
        "language": 'enUS',
        "userAgent": 'MyUserAgent', 
        "resolution": '1024x768',
        "platform": 'mac',
    }
});

print('profile id=', profile_id);

gl.update({
    "id": profile_id,
    "name": 'profile_mac2',
});

profile = gl.getProfile(profile_id);

print('new profile name=', profile.get("name"));

gl.delete(profile_id)