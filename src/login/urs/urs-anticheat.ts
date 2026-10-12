import { randomBytes } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { Script } from 'node:vm';
import type { WatchmanDeviceState, WatchmanFields } from './urs-device.ts';
import { decodeUrsPacket } from './urs-packet-decoder.ts';

// Reviewed, offline pure codec from official wm.3.0.0_33d41777. No collector,
// DOM emulation, browser launch, transport, persisted HAR data, or SDK startup.
const CODEC_SOURCE = "var E=[\"Failed to load script(\", \"platform\", \"CSS1Compat\", \"clearColor\", \"getAttribute\", \"array\", \"setInterval\", \"This browser's implementation of Object.create is a shim and doesn't support a second argument.\", \"createEvent\", \"getBattery\"];var n=[\"webgl vertex shader high int precision rangeMax:\", \"value\", \"win\", \"vertexAttribPointer\", \"__webdriver_script_function\", \"srcElement\", \"textBaseline\", \"#069\", \"__\", \"move\", \"orientation\", \"motion\", \"phantomjs\", \"__selenium_unwrapped\", \"match\", \"charging\", \"unescape\", \"responseStart\", \"LEQUAL\", \"webgl vertex shader low float precision rangeMin:\", \"Date\", \"decodeURIComponent\", \"async\", \"performance\", \"inline\", \"serif\", \"VENDOR\", \"CAT_CANVAS\", \"reduction\", \"emit\", \"getContext\", \"uniform2f\", \"webgl alpha bits:\"];var h=[\"\", \"parent\", \"stack\", \"plugins\", \"getItem\", \"iOS\", \"Microsoft Internet Explorer\", \"mouseup\", \"getSupportedExtensions\", \"_battery\", \"appendChild\", \"evenodd\", \"webgl max vertex uniform vectors:\", \"\\\"\", \"innerText\", \"$\", \"%\", \"&\", \"adsbox\", \"'\", \"(\", \")\", \"rgb(255,255,0)\", \"getShaderPrecisionFormat\", \"textContent\", \"+\", \",\", \"iOs\", \"windvane\", \"version\", \"click\", \".\", \"_blur\", \"/\", \"18pt Arial\", \"0\", \"1\", \"2\", \"getChannelData\", \"3\", \"getContextAttributes\", \"4\", \"_focus\", \"stop\", \"5\", \"left\", \"6\", \"7\", \"domain\", \"8\", \"9\", \":\", \";\", \"=\", \"mousedown\", \"object\", \"?\", \"webgl fragment shader medium float precision rangeMax:\", \"__fxdriver_unwrapped\", \"A\", \"B\", \"nstool.netease.com/info.js\", \"MAX_VERTEX_ATTRIBS\", \"C\", \"D\", \"E\", \"F\", \"G\", \"H\", \"webgl fragment shader medium int precision rangeMin:\", \"I\", \"blur\", \"J\", \"K\", \"appMinorVersion\", \"L\", \"M\", \"N\", \"O\", \"P\", \"Q\", \"R\", \"Cwm fjordbank glyphs vext quiz, 😅😥👶😃\", \"S\", \"selenium\", \"T\", \"U\", \"dns_isp\", \"V\", \"W\", \"X\", \"Y\", \"LOW_INT\", \"Z\", \"[\", \"fetchStart\", \"getElementsByTagName\", \"]\", \"connect\", \"^\", \"cb\", \"a\", \"COLOR_BUFFER_BIT\", \"b\", \"__webdriver_script_fn\", \"c\", \"rmocx.RealPlayer G2 Control.1\", \"d\", \"Scripting.Dictionary\", \"e\", \"beginPath\", \"couchjs\", \"f\", \"g\", \"h\", \"1010\", \"i\", \"j\", \"k\", \"webgl fragment shader low float precision rangeMax:\", \"l\", \"m\", \"webgl version:\", \"n\", \"o\", \"p\", \"doNotTrack\", \"q\", \"chargingtimechange\", \"setTimeout\", \"r\", \"1005\", \"getTimezoneOffset\", \"changedTouches\", \"s\", \"webgl fragment shader low int precision rangeMax:\", \"t\", \"1003\", \"u\", \"v\", \"1001\", \"w\", \"x\", \"This browser's implementation of Object.create is a shim and doesn't support 'null' as the first argument.\", \"drawArrays\", \"y\", \"toString\", \"z\", \"~\", \"1009\", \"font\", \"webgl fragment shader low int precision:\", \"suffixes\", \"POST\", \"Shell.UIHelper\", \"setRequestHeader\", \"toDataURL\", \"Safari\", \"TouchEvent\", \"language\", \"down\", \"insertBefore\", \"div\", \"acceleration\", \"accelerationIncludingGravity\", \"7471367db2084798ac84144dc3199631\", \"Internet Explorer\", \"MAX_CUBE_MAP_TEXTURE_SIZE\", \"text/javascript\", \"webgl vertex shader high float precision:\", \"webgl vertex shader high float precision rangeMax:\", \"webdriver\", \"MOZ_EXT_texture_filter_anisotropic\", \"WEBGL_debug_renderer_info\", \"chargingchange\", \"webgl shading language version:\", \"res\", \"RealPlayer\", \"chrome\", \"RegExp\", \"chargingTime\", \"createElement\", \"productNumber\", \"parentNode\", \"webgl fragment shader medium float precision:\", \"webgl max varying vectors:\", \"canvas winding:\", \"rgb(255,0,255)\", \"Content-type\", \"DEPTH_TEST\", \"external\", \"eval\", \"unknown error\", \"Linux\", \"dischargingtimechange\", \"success\", \"_scroll\", \"QuickTimeCheckObject.QuickTimeCheck.1\", \"6775689a\", \"Request timed out\", \"https:\", \"removeItem\", \"attachShader\", \"webgl renderer:\", \"startRendering\", \"getTime\", \"callSelenium\", \"responseText\", \"rangeMin\", \"initWatchman\", \"request api error\", \"1.01\", \"webgl depth bits:\", \"nodejs\", \"webgl max cube map texture size:\", \"title\", \"/v3/d\", \"__wmjsonp_\", \"timeout\", \"devicePixelRatio\", \"pointerup\", \"random\", \"setAttribute\", \"_selenium\", \"memoryStorage\", \"fp_\", \"alpha\", \"webgl vendor:\", \"__webdriver_evaluate\", \"multiply\", \"attribute vec2 attrVertexvarying vec2 varyinTexCoordinateuniform vec2 uniformOffsetvoid main(){varyinTexCoordinate=attrVertex+uniformOffsetgl_Position=vec4(attrVertex,0,1)}\", \"%c\", \"webgl fragment shader high float precision:\", \"precision mediump floatvarying vec2 varyinTexCoordinatevoid main() {gl_FragColor=vec4(varyinTexCoordinate,0,1)}\", \"',\", \"windows phone\", \"appName\", \"cpuClass\", \"merged\", \"parse\", \"ip_isp\", \"keydown\", \"onload\", \"removeEventListener\", \"form\", \"Msxml2.DOMDocument\", \"/tool.min.js\", \"webkitOfflineAudioContext\", \";expires=Tue, 19 Jan 2038 03:14:07 GMT;path=/;\", \"webgl antialiasing:\", \"levelchange\", \"webgl unmasked vendor:\", \"addEventListener\", \"HI\", \"Object.keys called on non-object\", \"webgl vertex shader low int precision:\", \"11pt Arial\", \"closePath\", \"release\", \"YD00934933655513\", \"WebGLRenderingContext\", \"focus\", \"ipod\", \"_orientation\", \"UPDATE_FUNC_TIMING\", \"number\", \"navigation\", \"alphabetic\", \"mspointerup\", \"_motion\", \"getOwnPropertyDescriptor\", \"webgl fragment shader high float precision rangeMin:\", \"__webdriver_unwrapped\", \"attrVertex\", \"webgl fragment shader low int precision rangeMin:\", \"cookie\", \"%22\", \").\", \"webgl max render buffer size:\", \"pike\", \"ip\", \"dns\", \"%26\", \"disableCookie\", \"script\", \"Mac\", \"rgb(0,255,255)\", \"driver\", \"DEPTH_BITS\", \"fontSize\", \"fillStyle\", \"PDF.PdfCtrl\", \"interval\", \"ALPHA_BITS\", \"status\", \"Interval\", \"charset\", \"webgl max vertex attribs:\", \"webgl red bits:\", \"Max\", \"WEBKIT_EXT_texture_filter_anisotropic\", \"MAX_FRAGMENT_UNIFORM_VECTORS\", \"devicemotion\", \"send device data failed\", \"UPDATE_OPTIONS\", \"mac\", \"RealPlayer.RealPlayer(tm) ActiveX Control (32-bit)\", \"xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx\", \"top\", \"webgl vertex shader medium int precision rangeMax:\", \"MAX_TEXTURE_SIZE\", \"AcroPDF.PDF\", \"MAX_VIEWPORT_DIMS\", \" this is null or not defined\", \"MAX_VERTEX_UNIFORM_VECTORS\", \"_Selenium_IDE_Recorder\", \"java.lang.System.exit\", \"max\", \"touchstart\", \"hardwareConcurrency\", \"knee\", \"availWidth\", \"documentMode\", \", \", \"MAX_TEXTURE_MAX_ANISOTROPY_EXT\", \"rmocx.RealPlayer G2 Control\", \"getToken\", \"complete\", \"availHeight\", \"_phantom\", \"auto\", \"opera\", \"ARRAY\", \"webgl\", \"RED_BITS\", \"pointerdown\", \"precision\", \"screen\", \"超时了\", \"body\", \"TRIANGLE_STRIP\", \"MAX_RENDERBUFFER_SIZE\", \"clientWidth\", \"ontouchstart\", \"function\", \"context.hashCode\", \"readyState\", \"mmmmmmmmmmlli\", \"oncomplete\", \"VERTEX_SHADER\", \"\\\"this\\\" is null or not defined\", \"browserLanguage\", \"level\", \"UTF-8\", \"webgl fragment shader high int precision:\", \"Android\", \"innerWidth\", \"200\", \" - \", \"Failed to load \", \"UPDATE_TIME_OFFSET\", \"position\", \"send devicedata failed: \", \"cannot got value\", \"no\", \"disableSensor\", \"[object Array]\", \"webgl max viewport dims:\", \"Windows\", \"BLUE_BITS\", \"webgl vertex shader medium int precision:\", \"head\", \"rect\", \"hasOwnProperty\", \"reduce called on null or undefined\", \"ALIASED_POINT_SIZE_RANGE\", \"Adodb.Stream\", \"webgl green bits:\", \"BatteryManager\", \"callPhantom\", \"floor\", \"__driver_unwrapped\", \"beta\", \"on\", \"RENDERER\", \"src\", \"DevalVRXCtrl.DevalVRXCtrl.1\", \"globalCompositeOperation\", \"addBehavior\", \"&nbsp;\", \"spawn\", \"HIGH_INT\", \"rangeMax\", \"batteryInterval\", \"CAT_WEBGL\", \"(function(){return 123;})();\", \"20030107\", \"stringify\", \"compatMode\", \"Windows Phone\", \"isPrototypeOf\", \"extensions:\", \"🧥🐶🍏⚽️✂🈲🚗⌚️❤️🏁▶\", \" is not a function\", \"NEWatchmanError\", \"00000000\", \"removeChild\", \"webgl aliased line width range:\", \"webgl max texture size:\", \"webgl vertex shader low int precision rangeMax:\", \"send behaviordata failed: \", \"useProgram\", \"domAutomation\", \"hostname\", \"XDomainRequest\", \"requestStart\", \"phantom.injectJs\", \"clearTimeout\", \"ERROR\", \"touchend\", \"state\", \"webgl max anisotropy:\", \"ShockwaveFlash.ShockwaveFlash\", \"height\", \"3.0.0_33d41777\", \"webgl vertex shader medium int precision rangeMin:\", \"EXT_texture_filter_anisotropic\", \"/v2/collect\", \"AgControl.AgControl\", \"touchmove\", \"decodeURI\", \"clientHeight\", \"Firefox\", \"input\", \"123\", \"__webdriver_script_func\", \"WMPlayer.OCX\", \"72px\", \"b4dff407\", \"webgl vertex shader low float precision:\", \"propertyIsEnumerable\", \"onreadystatechange\", \"safari\", \"behavior api response wrong\", \"document\", \"dns_city\", \"webgl fragment shader high float precision rangeMax:\", \"deviceorientation\", \"battery\", \"-9999px\", \"userLanguage\", \"businessKey is illegal\", \"pointermove\", \"arc\", \"SHADING_LANGUAGE_VERSION\", \"min\", \"attack\", \"LOW_FLOAT\", \"sessionStorage\", \"Object prototype may only be an Object: \", \"compileShader\", \"iframe\", \"escape\", \"mspointermove\", \"systemLanguage\", \"languages\", \"Skype.Detection\", \"2d\", \"ActiveXObject\", \"absolute\", \"offsetHeight\", \"STRING\", \"XMLHttpRequest\", \"The server has encountered an error\", \"colorDepth\", \"open\", \"gamma\", \"domain=\", \"webgl vertex shader medium float precision rangeMin:\", \"ratio\", \"Other\", \"RealVideo.RealVideo(tm) ActiveX Control (32-bit)\", \"OfflineAudioContext\", \"webgl blue bits:\", \"navigator\", \"mspointerdown\", \"#f60\", \"webgl fragment shader medium int precision:\", \"isNaN\", \"fillRect\", \"frequency\", \"loaded\", \"encodeURI\", \"attachEvent\", \"webgl max vertex texture image units:\", \"MAX_VERTEX_TEXTURE_IMAGE_UNITS\", \"up\", \"webgl fragment shader high int precision rangeMax:\", \"device api response wrong\", \"createProgram\", \"GREEN_BITS\"];var Y=[\"isTrusted\", \"pageXOffset\", \"NUMBER\", \"innerHeight\", \"9,b,2,0,6,9,e,b\", \"monospace\", \"clientY\", \"clientX\", \"constructor\", \"STATIC_DRAW\", \"productSub\", \"BOOLEAN\", \"opr\", \"MAX_TEXTURE_IMAGE_UNITS\", \"abort\", \"dAWsBhCqtOaNLLJ25hBzWbqWXwiK99Wd\", \"dns_province\", \"webgl aliased point size range:\", \"uniformOffset\", \"encodeURIComponent\", \"initCaptchaWatchman\", \"toLocaleString\", \"documentElement\", \"bindBuffer\", \"string\", \"onerror\", \"MEDIUM_FLOAT\", \"responseEnd\", \"MAX_COMBINED_TEXTURE_IMAGE_UNITS\", \"localStorage\", \"android\", \"canvas fp:\", \"destination\", \"description\", \"indexedDB\", \"createBuffer\", \"__driver_evaluate\", \"linkProgram\", \"button\", \"linux\", \"createShader\", \"Chrome\", \"normal\", \"webgl stencil bits:\", \"trident\", \"Reduce of empty array with no initial value\", \"yes\", \"SWCtl.SWCtl\", \"valueOf\", \"webgl vertex shader medium float precision:\", \"start\", \"WoeTpXnDDPhiAvsJUUIY3RdAo2PKaVwi\", \"createOscillator\", \"Does not support CORS\", \"detachEvent\", \"target\", \"parseInt\", \"gbk\", \"getUniformLocation\", \"\\\\((.+)\\\\)$\", \"shaderSource\", \"location\", \"HEX\", \"window\", \"initNEWatchman\", \"disconnect\", \"appVersion\", \"mousemove\", \"type\", \"webgl fragment shader medium float precision rangeMin:\", \"webgl vertex shader high int precision rangeMin:\", \"enableVertexAttribArray\", \"javaEnabled\", \"oscpu\", \"webgl fragment shader medium int precision rangeMax:\", \"options\", \"webgl vertex shader low float precision rangeMax:\", \"MAX_VARYING_VECTORS\", \"openDatabase\", \"getParameter\", \"Buffer\", \"STENCIL_BITS\", \"canvas\", \"HIGH_FLOAT\", \"webgl vertex shader low int precision rangeMin:\", \": \", \"scroll\", \"batteryMax\", \"DEPTH_BUFFER_BIT\", \"createDynamicsCompressor\", \"iphone\", \"webgl fragment shader low float precision:\", \"ip_province\", \"__selenium_evaluate\", \"Msxml2.XMLHTTP\", \"/v3/b\", \"pageYOffset\", \"GET\", \"style\", \"depthFunc\", \"Opera\", \"::\", \"parseFloat\", \"webgl fragment shader low float precision rangeMin:\", \"getAttribLocation\", \"utf8\", \"webgl unmasked renderer:\", \"triangle\", \"unknown\", \"undefined\", \"\\\\.\", \"event\", \"getExtension\", \"33d41777\", \"cache_\", \"offsetWidth\", \"userAgent\", \"QuickTime.QuickTime\", \"JSCookie\", \"experimental-webgl\", \"dischargingTime\", \"__nightmare\", \"ARRAY_BUFFER\", \"MEDIUM_INT\", \"request resource error\", \"withCredentials\", \"ip_city\", \"=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/\", \"Missing business key\", \"width\", \"webgl max fragment uniform vectors:\", \"VERSION\", \"TDCCtl.TDCCtl\", \"self\", \"lineHeight\", \"Sequentum\", \"span\", \"msg\", \"innerHTML\", \"cookieEnabled\", \"rhino\", \"firefox\", \"[NEGuardian] required product number\", \"threshold\", \"appCodeName\", \"Netscape\", \"bb99db1_7\", \"bb99db1_6\", \"protocol\", \"bb99db1_5\", \"fontFamily\", \"bb99db1_4\", \"webgl max texture image units:\", \"bb99db1_9\", \"://\", \"scrollLeft\", \"bb99db1_3\", \"bb99db1_2\", \"bb99db1_1\", \"__fxdriver_evaluate\", \"[object Function]\", \"timing\", \"toSource\", \"CAT_FONTS\", \"Cwm fjordbank glyphs vext quiz, 😅😥👶😃🧥🐶🍏⚽️✂🈲🚗⌚️❤️🏁▶\", \"application/x-www-form-urlencoded\", \"Response is empty\", \"0123456789abcdef\", \"sans-serif\", \"webgl max combined texture image units:\", \"webgl vertex shader high float precision rangeMin:\", \"history\", \"webgl vertex shader medium float precision rangeMax:\", \"webgl fragment shader high int precision rangeMin:\", \"scrollTop\", \"webgl vertex shader high int precision:\", \"FRAGMENT_SHADER\", \"apiServer\", \"ipad\", \"rgba(102, 204, 0, 0.2)\", \"MacromediaFlashPaper.MacromediaFlashPaper\", \"send\", \"domAutomationController\", \"screenX\", \"?&\", \"ALIASED_LINE_WIDTH_RANGE\", \"renderedBuffer\", \"error\"];var Z=[93, 82, 74, 0, 2, 1423857449, -2, 1873313359, 3, -3, 1555261956, 4, 2847714899, -1444681467, -4, -1732584194, 5, 1163531501, -5, 2714866558, 1281953886, 6, -6, 198958881, 1141124467, 2970347812, 7, -198630844, -7, 3110523913, 8, -8, 2428444049, 1272893353, 9, -722521979, -9, 10, -10, 11, -11, 2563907772, -12, 12, 2282248934, 13, -13, 2154129355, 14, -14, 15, -15, 16, -16, 17, -17, -18, 18, -701558691, -19, 19, 20, -20, 21, -21, -22, 22, 23, -23, 24, -24, 25, -25, 26, -26, -27, 27, 28, -28, 29, -29, 30, -30, 31, -31, 32, 33, -33, -32, -34, -35, 35, 34, 37, 36, -37, -36, 39, -39, 38, -38, 40, -40, -41, 41, -176418897, -42, -43, 42, 43, 45, -45, 44, -44, -47, 47, 46, -46, 48, -49, -48, 49, 50, -50, 51, -51, 570562233, 53, -53, 52, -52, 55, 54, -54, -55, 503444072, -57, 57, 56, -56, 58, -58, -59, 59, 60, 61, -61, -60, 63, 62, -62, -63, -64, 64, 711928724, -67, 67, 65, 66, -65, -66, -70, -68, 69, 68, -69, -71, 70, 71, 75, 3686517206, -73, 72, 74, -72, 73, -75, -74, 79, -79, -76, 77, -77, -78, 78, 76, 3554079995, 82, -82, -80, 81, -83, 83, -81, 80, -87, 86, 87, 85, 84, -84, -86, -85, 88, -89, 90, -90, -91, 91, 89, -88, 93, -92, 92, -93, -94, -95, 95, 94, -99, 97, -97, -96, 96, 98, -98, 99, 1735328473, 3272380065, 100, 101, 102, 103, -102, -103, -101, -100, 105, -105, 106, 104, -107, -106, 107, -104, -108, -110, -109, 111, 109, 108, 110, -111, 113, 251722036, 114, 115, -112, -114, 112, -113, -115, -116, 116, 119, -118, 118, -119, -117, 117, 123, -120, -121, 122, 120, 121, -122, -123, 125, 127, 3412177804, 126, 124, -127, -125, -126, -124, -128, 128, -129, 130, 1843258603, 150, 3803740692, 984961486, 3939845945, 44100, 4195302755, 200, 201, 202, 203, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 221, 222, 223, 225, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 4066508878, 240, 241, 242, 243, 255, 1706088902, 256, 300, 327, 1969922972, 2097651377, 1291169091, 376229701, 400, 401, 402, 403, 404, 405, 606105819, 420, 450, 451, 470, 853044451, 500, 512, 701, 702, 703, 707, 704, 705, 706, 708, 709, 710, 711, 712, 713, 752459403, 800, 801, 802, 803, 804, 658871167, 1000.0, 426522225, 1236535329, 3772115230, 615818150, 3904427059, 4167216745, 4027552580, 2000.0, 3654703836, 1886057615, -145523070, 879679996, 3518719985, 3000.0, 3244367275, 2013776290, 3373015174, 1390208809, 4500, -1019803690, 5000.0, 1759359992, 6000.0, 285281116, 1622183637, 1006888145, 1231636301, 10000.0, 83908371, -155497632, 1090812512, 1732584193, 2463272603, 1373503546, 2596254646, 2321926636, 1504918807, 2181625025, 2882616665, 2747007092, -271733879, 3009837614, 60000.0, 3138078467, -30611744, -2054922799, -1502002290, -42063, 397917763, 81470997, 829329135, 2657392035, 956543938, 2517215374, 2262029012, 40735498, 2394877945, 702138776, 2808555105, 38016083, 2936675148, 1258607687, 1131014506, 3218104598, 3082640443, 1404277552, -1926607734, 565507253, 4283543511, 534414190, 1541320221, 1913087877, 2053790376, -660478335, 1789927666, 3965973030, 3826175755, 4107580753, 4240017532, 1804603682, 1658658271, 3579855332, -1416354905, 3708648649, 3453421203, -358537222, 3317316542, -1560198380, -1473231341, 1873836001, 1742555852, 3608007406, 1996959894, 3747672003, -1990404162, -995338651, 3485111705, 2137656763, -2022574463, 3352799412, 213261112, 3993919788, 1.01, 3865271297, 4139329115, 4275313526, -405537848, -1094730640, 1549556828, 282753626, 1068828381, 909522486, 2768942443, 2909243462, 936918000.0, -1044525330, 3183342108, 141376813, 3050360625, 654459306, 2617837225, 1454621731, 271733878, 2489596804, 76029189, 2227061214, 1591671054, 2362670323, 4294967296, 4294967295, -40341101, 1308918612, 795835527, 1181335161, 414664567, 4279200368, 1661365465, 1839030562, 1037604311, 4150417245, 3887607047, 1802195444, 4023717930, 2075208622, -165796510, 1943803523, 901097722, 568446438, 628085408, 755167117, 3322730930, 3462522015, 3736837829, 3604390888, 2366115317, -187363961, 0.4, 2238001368, 2512341634, 2647816111, -1120210379, -0.2, 314042704, 1510334235, -1069501632, 1382605366, 31158534, 450548861, 643717713, 3020668471, 1119000684, 3160834842, 2898065728, 1256170817, 2765210733, 3060149565, 3188396048, 2932959818, 124634137, 2797360999, -373897302, -1894986606, -1530992060, 366619977, 62317068, -0.26, 1200080426, 1202900863, 498536548, 1340076626, 1126891415, 2405801727, -1051523, 2265490386, 1594198024, 1466479909, 2547177864, 249268274, 2680153253, 2125561021, 3294710456, 855842277, 3423369109, 0.732134444, 3705015759, 3569037538, 1994146192, -45705983, 1711684554, 1852507879, 997073096, -421815835, 289559509, 733239954, 4251122042, 601450431, 4111451223, 167816743, 3855990285, 3981806797, 3988292384, 3369554304, 3233442989, 3495958263, 3624741850, 65535, 453092731, -0.9, 2094854071, 1957810842, 325883990, 4057260610, 1684777152, 4189708143, 3915621685, 162941995, 1812370925, 3775830040, 783551873, 3134207493, 1172266101, 2998733608, 2724688242, 1303535960, 2852801631, 112637215, 1567103746, 444984403, 651767980, 1426400815, -1958414417, -51403784, -680876936, 906185462, 2211677639, 1047427035, -57434055, 2344532202, 2607071920, 681279174, 2466906013, 225274430, 544179635, 2176718541, 2312317920, 1483230225, 1342533948, 2567524794, 2439277719, 1088359270, 1309151649, 671266974, -343485551, 1219638859, 718787259, 953729732, 2277735313, 3099436303, 2966460450, 817233897, 2685067896, 2825379669, -35309556, 4089016648, 530742520, 4224994405, 3943577151, 3814918930, 1700485571, 0.25, -640364487, 476864866, 944331445, 1634467795, 335633487, 1762050814, -378558, -1, 1, 2044508324, 3401237130, 3268935591, 3524101629, 3663771856, 1770035416, 1907459465, -389564586, 3301882366];var ca=[105,79,-49,-99,-70,93,33,-57,-45,28,88,61,12,-116,127,-42,-43,-68,13,36,2,58,-21,-89,7,14,-14,45,64,-62,-108,63,-63,-61,-34,-19,72,86,-35,51,-92,101,-27,-120,97,57,69,-121,-40,42,102,113,-105,-33,-18,87,-128,-79,106,82,104,11,85,92,74,1,53,114,-58,56,-56,-97,75,-67,50,122,47,-59,25,-110,-3,-109,84,-76,-84,-37,126,-8,67,120,121,17,29,90,116,111,-12,-36,18,-28,-122,19,55,103,-90,-1,-96,-102,26,-51,54,30,-64,68,20,-60,-82,-103,65,125,-31,-39,-5,-24,-80,-7,-69,62,-86,23,115,-9,96,-41,9,-72,-23,119,-107,100,24,-47,77,35,124,-127,-2,22,81,-83,-118,118,-54,34,73,-93,-71,39,-112,70,-73,-77,5,-91,-78,-11,10,98,27,-94,37,44,38,-10,-87,0,-53,-4,91,109,-48,-106,15,83,4,41,66,46,-16,-15,-125,-65,59,-98,-17,108,-85,89,-81,-123,-75,49,60,80,71,-126,-74,-13,-95,-50,-55,-119,95,-101,8,-29,3,-66,43,6,-6,-88,99,-32,123,78,110,52,48,94,-117,-52,-25,-124,-114,112,-113,-26,-30,-38,16,-44,-46,117,21,32,-100,31,-115,76,-22,-20,107,-111,40,-104],_Z=[h[107],h[109],h[70],h[121],h[116],h[33],h[123],h[90],h[124],h[117],h[112],h[39],h[49],h[118],h[50],h[105],h[93],h[31],h[103],h[76],h[88],h[47],h[59],h[83],h[36],h[130],h[46],h[35],h[63],h[125],h[114],h[86],h[145],h[134],h[75],h[25],h[101],h[139],h[64],h[91],h[44],h[147],h[138],h[72],h[66],h[85],h[127],h[41],h[68],h[113],h[79],h[60],h[120],h[73],h[81],h[80],h[141],h[65],h[37],h[78],h[136],h[89],h[67],h[77]],SZ=[h[59],h[60],h[63],h[64],h[65],h[66],h[67],h[68],h[70],h[72],h[73],h[75],h[76],h[77],h[78],h[79],h[80],h[81],h[83],h[85],h[86],h[88],h[89],h[90],h[91],h[93],h[101],h[103],h[105],h[107],h[109],h[112],h[113],h[114],h[116],h[117],h[118],h[120],h[121],h[123],h[124],h[125],h[127],h[130],h[134],h[136],h[138],h[139],h[141],h[142],h[145],h[147],h[35],h[36],h[37],h[39],h[41],h[44],h[46],h[47],h[49],h[50],h[25],h[33]];var MZ=\"x\",IZ=\"=\",fa=Z[153],Ua=Z[153],sa=Z[11],da=Z[11],OZ=Object.prototype.toString,sZ=encodeURIComponent,gZ=unescape,vZ=parseInt;var WZ=\"NUMBER\",$Z=\"STRING\",HZ=\"HEX\",zZ=\"BOOLEAN\",QZ=\"ARRAY\";function a(x){return typeof x;}\nfunction g(){return h[307].replace(/[xy]/g,function(E){var a=Math[h[221]]()*Z[52]|Z[3];return(E===h[142]?a:a&Z[8]|Z[30]).toString(Z[52])})}\nfunction L(E){for(var Z,a,r=E.length;r;)a=Math[h[380]](Math[h[221]]()*r--),Z=E[r],E[r]=E[a],E[a]=Z;return E}\nfunction N(E,r){if(null==E)throw new TypeError(h[374]);if((\"undefined\"==typeof r?\"undefined\":a(r))!==h[344])throw new TypeError(r+h[403]);var t,e=E.length>>>Z[3],m=Z[3];if(arguments.length===Z[8])t=arguments[2];else{for(;m<e&&!(m in E);)m++;if(m>=e)throw new TypeError(Y[45]);t=E[m++]}for(;m<e;m++)m in E&&(t=r(t,E[m],m,E));return t}\nfunction F(E,a,r,t,e){void 0===r&&(r=Z[3]),void 0===t&&(t=_Z),void 0===e&&(e=MZ);var m,n=[];switch(r){case Z[678]:r=E[a],m=Z[3],n.push(t[r>>>Z[4]&Z[148]],t[(r<<Z[11]&Z[118])+(m>>>Z[11]&Z[50])],e,e);break;case Z[4]:r=E[a],m=E[a+Z[678]],E=Z[3],n.push(t[r>>>Z[4]&Z[148]],t[(r<<Z[11]&Z[118])+(m>>>Z[11]&Z[50])],t[(m<<Z[4]&Z[144])+(E>>>Z[21]&Z[8])],e);break;case Z[8]:r=E[a],m=E[a+Z[678]],E=E[a+Z[4]],n.push(t[r>>>Z[4]&Z[148]],t[(r<<Z[11]&Z[118])+(m>>>Z[11]&Z[50])],t[(m<<Z[4]&Z[144])+(E>>>Z[21]&Z[8])],t[E&Z[148]]);break;default:throw Error(h[115])}return n.join(h[0])}\nfunction B(E,a,r){if(void 0===a&&(a=[]),void 0===r&&(r=MZ),!E)return null;if(E.length===Z[3])return h[0];var t=Z[8];try{for(var e=[],m=Z[3];m<E.length;){if(!(m+t<=E.length)){e.push(F(E,m,E.length-m,a,r));break}e.push(F(E,m,t,a,r)),m+=t}return e.join(h[0])}catch(n){throw Error(h[115])}}\nfunction D(E){return void 0===E&&(E=[]),B(E,SZ,IZ)}\nfunction P(E){if(E<Z[287])return P(Z[288]-(Z[287]-E));if(E>=Z[287]&&E<=Z[279])return E;if(E>Z[279])return P(Z[289]+E-Z[279]);throw Error(h[140])}\nfunction q(E,Z){return P(E+Z)}\nfunction R(E,Z){return P(P(E)^P(Z))}\nfunction J(E,a){if(void 0===E&&(E=[]),void 0===a&&(a=[]),E.length!==a.length)return[];for(var r=[],t=Z[3],e=E.length;t<e;t++)r[t]=R(E[t],a[t]);return r}\nfunction V(E){return void 0===E&&(E=[]),E.map(function(E){var a=[h[35],h[36],h[37],h[39],h[41],h[44],h[46],h[47],h[49],h[50],h[101],h[103],h[105],h[107],h[109],h[112]];return h[0]+a[E>>>Z[11]&Z[50]]+a[E&Z[50]]}).join(h[0])}\nfunction G(E){void 0===E&&(E=h[0]),E=(\"undefined\"==typeof E?\"undefined\":a(E))===Y[24]?E:String(E);for(var r=[],t=Z[3],e=Z[3],m=E.length/Z[4];t<m;t++){var n=vZ(E.charAt(e++),Z[52])<<Z[11],i=vZ(E.charAt(e++),Z[52]);r[t]=P(n+i)}return r}\nfunction K(E){if(null===E||void 0===E)return E;E=sZ(E);for(var a=[],r=Z[3],t=E.length;r<t;r++)if(E.charAt(r)===h[16]){if(!(r+Z[4]<t))throw Error(h[149]);a.push(z(E.charAt(++r)+h[0]+E.charAt(++r))[0])}else a.push(P(E.charCodeAt(r)));return a}\nfunction W(E){var a=[];return a[0]=P(E>>>Z[69]&Z[336]),a[1]=P(E>>>Z[52]&Z[336]),a[2]=P(E>>>Z[30]&Z[336]),a[3]=P(E&Z[336]),a}\nfunction $(E,a,r,t,e){if(void 0===E&&(E=[]),void 0===r&&(r=[]),E.length){if(E.length<e)throw Error(h[137]);for(var m=Z[3];m<e;m++)r[t+m]=E[a+m]}}\nfunction H(){return Array.apply(null,Array(Z[37])).map(function(){return Z[3]})}\nfunction z(E){if(null===E||E.length===Z[3])return[];E=(\"undefined\"==typeof E?\"undefined\":a(E))===Y[24]?E:String(E);for(var r=[],t=Z[3],e=Z[3],m=E.length/Z[4];e<m;e++){var n=vZ(E.charAt(t++),Z[52])<<Z[11],h=vZ(E.charAt(t++),Z[52]);r[e]=P(n+h)}return r}\nfunction rE(E){void 0===E&&(E=[]);var a=[];if(!E.length)return H();if(E.length>=Ua){var a=Z[3],r=Ua;void 0===E&&(E=[]);var t=[];if(E.length){if(E.length<r)throw Error(h[137]);for(var e=Z[3];e<r;e++)t[e]=E[a+e]}return t}for(r=Z[3];r<Ua;r++)a[r]=E[r%E.length];return a}\nfunction tE(E){if(void 0===E&&(E=[]),!E.length)return[];for(var a=[],r=Z[3],t=E.length;r<t;r++){var e=E[r];a[r]=ca[(e>>>Z[11]&Z[50])*Z[52]+(e&Z[50])]}return a}\nfunction eE(E,a){if(void 0===E&&(E=[]),!E.length)return[];a=P(a);for(var r=[],t=Z[3],e=E.length;t<e;t++)r.push(R(E[t],a++));return r}\nfunction mE(E,a){if(void 0===E&&(E=[]),!E.length)return[];a=P(a);for(var r=[],t=Z[3],e=E.length;t<e;t++)r.push(P(E[t]+a));return r}\nfunction nE(E,a){if(void 0===E&&(E=[]),!E.length)return[];a=P(a);for(var r=[],t=Z[3],e=E.length;t<e;t++)r.push(q(E[t],a++));return r}\nfunction hE(E,a){if(void 0===E&&(E=[]),!E.length)return[];a=P(a);for(var r=[],t=Z[3],e=E.length;t<e;t++)r.push(q(E[t],a--));return r}\nfunction YE(E){return N([[nE,Z[195]],[eE,Z[171]],[mE,Z[270]],[hE,Z[114]],[mE,Z[65]]],function(E,Z){return Z[0](E,Z[1])},E)}\nfunction iE(E){void 0===E&&(E=[]);var a,r=h[165];a=[Z[3],Z[472],Z[481],Z[647],Z[558],Z[389],Z[614],Z[431],Z[577],Z[679],Z[382],Z[576],Z[615],Z[579],Z[520],Z[32],Z[568],Z[454],Z[663],Z[505],Z[547],Z[291],Z[457],Z[634],Z[610],Z[612],Z[594],Z[415],Z[674],Z[516],Z[297],Z[534],Z[590],Z[20],Z[461],Z[622],Z[405],Z[441],Z[682],Z[492],Z[526],Z[550],Z[170],Z[552],Z[356],Z[620],Z[584],Z[418],Z[628],Z[413],Z[601],Z[443],Z[447],Z[501],Z[476],Z[657],Z[651],Z[574],Z[530],Z[25],Z[512],Z[645],Z[394],Z[555],Z[586],Z[546],Z[41],Z[522],Z[685],Z[625],Z[578],Z[384],Z[395],Z[254],Z[433],Z[617],Z[477],Z[497],Z[648],Z[483],Z[521],Z[671],Z[537],Z[331],Z[616],Z[606],Z[417],Z[596],Z[337],Z[542],Z[637],Z[458],Z[460],Z[563],Z[507],Z[665],Z[623],Z[294],Z[419],Z[585],Z[553],Z[518],Z[554],Z[186],Z[442],Z[391],Z[493],Z[683],Z[24],Z[581],Z[624],Z[463],Z[646],Z[499],Z[556],Z[396],Z[575],Z[642],Z[29],Z[531],Z[506],Z[437],Z[658],Z[479],Z[416],Z[618],Z[444],Z[602],Z[600],Z[414],Z[564],Z[609],Z[295],Z[539],Z[429],Z[525],Z[667],Z[503],Z[641],Z[452],Z[456],Z[640],Z[597],Z[342],Z[386],Z[573],Z[135],Z[675],Z[519],Z[47],Z[380],Z[589],Z[485],Z[644],Z[489],Z[470],Z[613],Z[436],Z[428],Z[404],Z[533],Z[19],Z[655],Z[569],Z[392],Z[559],Z[490],Z[653],Z[604],Z[440],Z[633],Z[410],Z[473],Z[661],Z[430],Z[513],Z[280],Z[551],Z[528],Z[545],Z[582],Z[423],Z[126],Z[629],Z[466],Z[621],Z[593],Z[10],Z[681],Z[498],Z[372],Z[450],Z[638],Z[455],Z[341],Z[435],Z[500],Z[666],Z[451],Z[408],Z[538],Z[293],Z[523],Z[480],Z[412],Z[598],Z[608],Z[23],Z[434],Z[611],Z[401],Z[449],Z[643],Z[484],Z[469],Z[514],Z[44],Z[515],Z[588],Z[403],Z[571],Z[385],Z[673],Z[344],Z[660],Z[471],Z[511],Z[432],Z[438],Z[603],Z[406],Z[635],Z[557],Z[388],Z[649],Z[494],Z[12],Z[532],Z[567],Z[659],Z[496],Z[680],Z[445],Z[383],Z[619],Z[464],Z[5],Z[595],Z[421],Z[580],Z[626],Z[154],Z[549],Z[228],Z[543],Z[529]];for(var t=Z[509],e=Z[3],m=E.length;e<m;e++)t=t>>>Z[30]^a[(t^E[e])&Z[336]];for(a=V(W(t^Z[509])),t=K(a),a=[],$(E,Z[3],a,Z[3],E.length),$(t,Z[3],a,a.length,t.length),E=K(r),void 0===a&&(a=[]),t=[],r=Z[3];r<da;r++)e=Math[h[221]]()*Z[338],e=Math[h[380]](e),t[r]=P(e);E=rE(E),E=J(E,rE(t)),r=E=rE(E);var n=a;if(void 0===n&&(n=[]),n.length){for(a=[],e=n.length,m=Z[3],m=e%fa<=fa-sa?fa-e%fa-sa:fa*Z[4]-e%fa-sa,$(n,Z[3],a,Z[3],e),n=Z[3];n<m;n++)a[e+n]=Z[3];$(W(e),Z[3],a,e+m,sa)}else a=H();if(e=a,void 0===e&&(e=[]),e.length%fa!==Z[3])throw Error(h[131]);a=[];for(var m=Z[3],n=e.length/fa,Y=Z[3];Y<n;Y++){a[Y]=[];for(var i=Z[3];i<fa;i++)a[Y][i]=e[m++]}for(e=[],$(t,Z[3],e,Z[3],da),t=Z[3],m=a.length;t<m;t++){n=YE(a[t]),n=J(n,E),Y=r,void 0===n&&(n=[]),void 0===Y&&(Y=[]);for(var i=[],o=Y.length,u=Z[3],c=n.length;u<c;u++)i[u]=P(n[u]+Y[u%o]);n=J(i,r),r=tE(n),r=tE(r),$(r,Z[3],e,t*fa+da,fa)}return B(e,_Z,MZ)}\nfunction oE(E){if(!E)return h[0];var a=Z[3],r=[Z[83],Z[278],Z[42],Z[144],Z[85],Z[118]];E=K(E);for(var t=[],e=Z[3];e<E.length;e++)t[e]=P(E[e]^r[a++%r.length]),t[e]=P(Z[3]-t[e]);return V(t)}\nfunction uE(E,a){var r=(E&Z[605])+(a&Z[605]);return(E>>Z[52])+(a>>Z[52])+(r>>Z[52])<<Z[52]|r&Z[605]}\nfunction cE(E,a,r,t,e,m){return E=uE(uE(a,E),uE(t,m)),uE(E<<e|E>>>Z[85]-e,r)}\nfunction fE(E,Z,a,r,t,e,m){return cE(Z&a|~Z&r,E,Z,t,e,m)}\nfunction UE(E,Z,a,r,t,e,m){return cE(Z&r|a&~r,E,Z,t,e,m)}\nfunction sE(E,Z,a,r,t,e,m){return cE(a^(Z|~r),E,Z,t,e,m)}\nfunction dE(E){var a,r=[];for(r[(E.length>>Z[4])-Z[678]]=void 0,a=Z[3];a<r.length;a+=Z[678])r[a]=Z[3];var t=E.length*Z[30];for(a=Z[3];a<t;a+=Z[30])r[a>>Z[16]]|=(E.charCodeAt(a/Z[30])&Z[336])<<a%Z[85];E=E.length*Z[30],r[E>>Z[16]]|=Z[288]<<E%Z[85],r[(E+Z[153]>>>Z[34]<<Z[11])+Z[48]]=E;var e,m,n=Z[411],Y=Z[420],i=Z[15],o=Z[502];for(E=Z[3];E<r.length;E+=Z[52])a=n,t=Y,e=i,m=o,n=fE(n,Y,i,o,r[E],Z[26],Z[632]),o=fE(o,n,Y,i,r[E+Z[678]],Z[43],Z[686]),i=fE(i,o,n,Y,r[E+Z[4]],Z[54],Z[351]),Y=fE(Y,i,o,n,r[E+Z[8]],Z[66],Z[495]),n=fE(n,Y,i,o,r[E+Z[11]],Z[26],Z[105]),o=fE(o,n,Y,i,r[E+Z[16]],Z[43],Z[566]),i=fE(i,o,n,Y,r[E+Z[21]],Z[54],Z[468]),Y=fE(Y,i,o,n,r[E+Z[26]],Z[66],Z[587]),n=fE(n,Y,i,o,r[E+Z[30]],Z[26],Z[684]),o=fE(o,n,Y,i,r[E+Z[34]],Z[43],Z[630]),i=fE(i,o,n,Y,r[E+Z[37]],Z[54],Z[427]),Y=fE(Y,i,o,n,r[E+Z[39]],Z[66],Z[474]),n=fE(n,Y,i,o,r[E+Z[43]],Z[26],Z[459]),o=fE(o,n,Y,i,r[E+Z[45]],Z[43],Z[510]),i=fE(i,o,n,Y,r[E+Z[48]],Z[54],Z[426]),Y=fE(Y,i,o,n,r[E+Z[50]],Z[66],Z[381]),n=UE(n,Y,i,o,r[E+Z[678]],Z[16],Z[524]),o=UE(o,n,Y,i,r[E+Z[21]],Z[34],Z[544]),i=UE(i,o,n,Y,r[E+Z[39]],Z[48],Z[548]),Y=UE(Y,i,o,n,r[E],Z[61],Z[560]),n=UE(n,Y,i,o,r[E+Z[16]],Z[16],Z[58]),o=UE(o,n,Y,i,r[E+Z[37]],Z[34],Z[439]),i=UE(i,o,n,Y,r[E+Z[50]],Z[48],Z[453]),Y=UE(Y,i,o,n,r[E+Z[11]],Z[61],Z[486]),n=UE(n,Y,i,o,r[E+Z[34]],Z[16],Z[527]),o=UE(o,n,Y,i,r[E+Z[48]],Z[34],Z[399]),i=UE(i,o,n,Y,r[E+Z[8]],Z[48],Z[535]),Y=UE(Y,i,o,n,r[E+Z[30]],Z[61],Z[17]),n=UE(n,Y,i,o,r[E+Z[45]],Z[16],Z[13]),o=UE(o,n,Y,i,r[E+Z[4]],Z[34],Z[631]),i=UE(i,o,n,Y,r[E+Z[26]],Z[48],Z[227]),Y=UE(Y,i,o,n,r[E+Z[43]],Z[61],Z[446]),n=cE(Y^i^o,n,Y,r[E+Z[16]],Z[11],Z[676]),o=cE(n^Y^i,o,n,r[E+Z[30]],Z[39],Z[478]),i=cE(o^n^Y,i,o,r[E+Z[39]],Z[52],Z[517]),Y=cE(i^o^n,Y,i,r[E+Z[48]],Z[67],Z[662]),n=cE(Y^i^o,n,Y,r[E+Z[678]],Z[11],Z[562]),o=cE(n^Y^i,o,n,r[E+Z[11]],Z[39],Z[33]),i=cE(o^n^Y,i,o,r[E+Z[26]],Z[52],Z[409]),Y=cE(i^o^n,Y,i,r[E+Z[37]],Z[67],Z[487]),n=cE(Y^i^o,n,Y,r[E+Z[45]],Z[11],Z[639]),o=cE(n^Y^i,o,n,r[E],Z[39],Z[465]),i=cE(o^n^Y,i,o,r[E+Z[8]],Z[52],Z[35]),Y=cE(i^o^n,Y,i,r[E+Z[21]],Z[67],Z[504]),n=cE(Y^i^o,n,Y,r[E+Z[34]],Z[11],Z[670]),o=cE(n^Y^i,o,n,r[E+Z[43]],Z[39],Z[591]),i=cE(o^n^Y,i,o,r[E+Z[50]],Z[52],Z[664]),Y=cE(i^o^n,Y,i,r[E+Z[4]],Z[67],Z[475]),n=sE(n,Y,i,o,r[E],Z[21],Z[27]),o=sE(o,n,Y,i,r[E+Z[26]],Z[37],Z[570]),i=sE(i,o,n,Y,r[E+Z[48]],Z[50],Z[462]),Y=sE(Y,i,o,n,r[E+Z[16]],Z[63],Z[636]),n=sE(n,Y,i,o,r[E+Z[43]],Z[21],Z[668]),o=sE(o,n,Y,i,r[E+Z[8]],Z[37],Z[561]),i=sE(i,o,n,Y,r[E+Z[37]],Z[50],Z[572]),Y=sE(Y,i,o,n,r[E+Z[678]],Z[63],Z[425]),n=sE(n,Y,i,o,r[E+Z[30]],Z[21],Z[7]),o=sE(o,n,Y,i,r[E+Z[50]],Z[37],Z[424]),i=sE(i,o,n,Y,r[E+Z[21]],Z[50],Z[467]),Y=sE(Y,i,o,n,r[E+Z[45]],Z[63],Z[650]),n=sE(n,Y,i,o,r[E+Z[11]],Z[21],Z[390]),o=sE(o,n,Y,i,r[E+Z[39]],Z[37],Z[540]),i=sE(i,o,n,Y,r[E+Z[4]],Z[50],Z[654]),Y=sE(Y,i,o,n,r[E+Z[34]],Z[63],Z[652]),n=uE(n,a),Y=uE(Y,t),i=uE(i,e),o=uE(o,m);for(r=[n,Y,i,o],a=h[0],t=r.length*Z[85],E=Z[3];E<t;E+=Z[30])a+=String.fromCharCode(r[E>>Z[16]]>>>E%Z[85]&Z[336]);return a}\nfunction lE(E){var a,r,t=Y[167],e=h[0];for(r=Z[3];r<E.length;r+=Z[678])a=E.charCodeAt(r),e+=t.charAt(a>>>Z[11]&Z[50])+t.charAt(a&Z[50]);return e}\nfunction kE(){var E=(new Date)[h[205]](),a=Math[h[380]](E/Z[508]),r=E%Z[508],E=W(a),r=W(r),a=[];for($(E,Z[3],a,Z[3],Z[11]),$(r,Z[3],a,Z[11],Z[11]),r=[],E=Z[3];E<Z[30];E++)r[E]=P(Math[h[380]](Math[h[221]]()*Z[338]));for(var E=[],t=Z[3];t<a.length*Z[4];t++){if(t%Z[4]==Z[3]){var e=t/Z[4];E[t]=E[t]|(r[e]&Z[52])>>>Z[11]|(r[e]&Z[85])>>>Z[8]|(r[e]&Z[153])>>>Z[4]|(r[e]&Z[288])>>>Z[678]|(a[e]&Z[52])>>>Z[8]|(a[e]&Z[85])>>>Z[4]|(a[e]&Z[153])>>>Z[678]|(a[e]&Z[288])>>>Z[3]}else e=Math[h[380]](t/Z[4]),E[t]=E[t]|(r[e]&Z[678])<<Z[3]|(r[e]&Z[4])<<Z[678]|(r[e]&Z[11])<<Z[4]|(r[e]&Z[30])<<Z[8]|(a[e]&Z[678])<<Z[678]|(a[e]&Z[4])<<Z[4]|(a[e]&Z[11])<<Z[8]|(a[e]&Z[30])<<Z[11];E[t]=P(E[t])}return a=V(E),a=lE(dE(gZ(sZ(a+Y[15])))),a=G(a.substring(Z[3],Z[52])),D(a.concat(E))}\nfunction O(E){return null==E?String(E):OZ.call(E).slice(Z[30],Z[677]).toLowerCase()}\nfunction wE(a,r){return O(a)===Y[24]?a.length>r?a.slice(Z[3],r):a:O(a)===E[5]&&a.length>r?a.slice(-r):a}\nfunction s(E,a,r){var t=a.a,e=a.e,m=[];if(!r&&(t===zZ&&(m=wE(W(E?Z[678]:Z[4]),e)),t===WZ&&(m=wE(W(E),e)),t===HZ&&(m=wE(z(E),e)),t===$Z&&(m=K(wE(E,e))),t===QZ))for(r=Z[3],t=E.length;r<t;r++){var n=e[r],i=E[r];O(E[r])===h[265]&&m.push.apply(m,wE(W(i),n)),O(E[r])===Y[24]&&m.push.apply(m,K(wE(i,n)))}return E=wE(W(a.c),Z[4]),a=wE(W(m.length),Z[4]),E.concat(a,m)}\n({encode:iE,encodeToken:oE,newSessionValue:kE,serialize:s,shuffle:L,uuid:g})";
type FieldSpec = { c: number; a: string; e: number | number[] };
const SCHEMA: Record<string, FieldSpec> = {"bc": {"c": 0, "a": "STRING", "e": 3}, "Oa": {"c": 1, "a": "STRING", "e": 20}, "Pa": {"c": 2, "a": "STRING", "e": 32}, "Ma": {"c": 3, "a": "STRING", "e": 32}, "Db": {"c": 4, "a": "STRING", "e": 32}, "Ub": {"c": 5, "a": "NUMBER", "e": 4}, "Lb": {"c": 6, "a": "NUMBER", "e": 1}, "Zb": {"c": 7, "a": "STRING", "e": 32}, "cb": {"c": 8, "a": "STRING", "e": 32}, "Kb": {"c": 9, "a": "STRING", "e": 32}, "ab": {"c": 10, "a": "STRING", "e": 128}, "cc": {"c": 107, "a": "NUMBER", "e": 4}, "_move": {"c": 109, "a": "ARRAY", "e": [2, 4, 1, 4, 4]}, "_down": {"c": 110, "a": "ARRAY", "e": [2, 4, 1, 2, 4, 4]}, "_up": {"c": 111, "a": "ARRAY", "e": [2, 4, 1, 4, 4]}, "_click": {"c": 112, "a": "ARRAY", "e": [2, 4, 1, 4, 4, 20]}, "_keydown": {"c": 113, "a": "ARRAY", "e": [2, 4, 1, 20]}, "_focus": {"c": 114, "a": "ARRAY", "e": [2, 4, 1, 20]}, "_blur": {"c": 115, "a": "ARRAY", "e": [2, 4, 1, 20]}, "_scroll": {"c": 116, "a": "ARRAY", "e": [2, 4, 1, 4, 4]}, "_orientation": {"c": 117, "a": "ARRAY", "e": [2, 4, 4, 4, 4, 1]}, "_motion": {"c": 118, "a": "ARRAY", "e": [2, 4, 4, 4, 4, 2]}, "_battery": {"c": 119, "a": "ARRAY", "e": [2, 4, 1, 1, 4]}, "$b": {"c": 200, "a": "STRING", "e": 400}, "zb": {"c": 201, "a": "STRING", "e": 20}, "Ta": {"c": 202, "a": "NUMBER", "e": 1}, "bb": {"c": 203, "a": "NUMBER", "e": 1}, "Vb": {"c": 206, "a": "NUMBER", "e": 1}, "Pb": {"c": 207, "a": "BOOLEAN", "e": 1}, "Cb": {"c": 208, "a": "BOOLEAN", "e": 1}, "tb": {"c": 209, "a": "BOOLEAN", "e": 1}, "Ea": {"c": 210, "a": "BOOLEAN", "e": 1}, "Fb": {"c": 211, "a": "BOOLEAN", "e": 1}, "Va": {"c": 212, "a": "STRING", "e": 10}, "Ib": {"c": 213, "a": "STRING", "e": 10}, "eb": {"c": 214, "a": "STRING", "e": 15}, "Jb": {"c": 215, "a": "HEX", "e": 16}, "Qa": {"c": 216, "a": "HEX", "e": 16}, "dc": {"c": 217, "a": "HEX", "e": 16}, "Da": {"c": 218, "a": "BOOLEAN", "e": 1}, "pb": {"c": 221, "a": "BOOLEAN", "e": 1}, "ob": {"c": 222, "a": "BOOLEAN", "e": 1}, "Yb": {"c": 223, "a": "BOOLEAN", "e": 1}, "Mb": {"c": 225, "a": "NUMBER", "e": 1}, "Ua": {"c": 228, "a": "BOOLEAN", "e": 1}, "xb": {"c": 229, "a": "BOOLEAN", "e": 1}, "Fa": {"c": 230, "a": "STRING", "e": 20}, "Ga": {"c": 231, "a": "STRING", "e": 10}, "Ha": {"c": 232, "a": "STRING", "e": 20}, "Ia": {"c": 233, "a": "STRING", "e": 150}, "Ab": {"c": 234, "a": "STRING", "e": 10}, "Sb": {"c": 235, "a": "STRING", "e": 10}, "ac": {"c": 236, "a": "STRING", "e": 10}, "Na": {"c": 237, "a": "STRING", "e": 10}, "Gb": {"c": 238, "a": "STRING", "e": 40}, "fb": {"c": 239, "a": "STRING", "e": 20}, "jb": {"c": 240, "a": "HEX", "e": 16}, "ib": {"c": 241, "a": "NUMBER", "e": 2}, "Nb": {"c": 242, "a": "ARRAY", "e": [2, 2, 2, 2]}, "mb": {"c": 243, "a": "NUMBER", "e": 1}, "nb": {"c": 401, "a": "BOOLEAN", "e": 1}, "hb": {"c": 402, "a": "STRING", "e": 10}, "Eb": {"c": 403, "a": "NUMBER", "e": 1}, "gb": {"c": 404, "a": "NUMBER", "e": 1}, "Qb": {"c": 405, "a": "BOOLEAN", "e": 1}, "Xb": {"c": 450, "a": "NUMBER", "e": 1}, "wb": {"c": 451, "a": "BOOLEAN", "e": 1}, "sb": {"c": 701, "a": "NUMBER", "e": 1}, "kb": {"c": 702, "a": "NUMBER", "e": 1}, "vb": {"c": 703, "a": "NUMBER", "e": 1}, "Ob": {"c": 704, "a": "NUMBER", "e": 5}, "qb": {"c": 705, "a": "NUMBER", "e": 1}, "Wb": {"c": 706, "a": "STRING", "e": 10}, "yb": {"c": 707, "a": "STRING", "e": 16}, "Tb": {"c": 708, "a": "NUMBER", "e": 2}, "rb": {"c": 709, "a": "NUMBER", "e": 2}, "ub": {"c": 710, "a": "NUMBER", "e": 2}, "lb": {"c": 711, "a": "ARRAY", "e": [3, 3, 3, 3, 3]}, "Hb": {"c": 712, "a": "ARRAY", "e": [1, 3, 3]}, "Sa": {"c": 713, "a": "ARRAY", "e": [4, 4]}, "Wa": {"c": 800, "a": "STRING", "e": 8}, "Xa": {"c": 801, "a": "STRING", "e": 8}, "Ya": {"c": 802, "a": "STRING", "e": 8}, "Za": {"c": 803, "a": "STRING", "e": 8}, "$a": {"c": 804, "a": "STRING", "e": 8}, "La": {"c": 327, "a": "STRING", "e": 32}};
// SDK AE() removes commas before the eight-byte metadata fields are serialized.
const META = {"Xa": "481d4ea4", "Ya": "9b2069eb", "Za": "6775689a", "$a": "b4dff407"};
type Codec = {
  encode(bytes: number[]): string;
  encodeToken(text: string): string;
  newSessionValue(): string;
  serialize(value: unknown, spec: FieldSpec): number[];
  shuffle<T>(values: T[]): T[];
  uuid(): string;
  wire: { substitution: number[]; alphabet: string; padding: string; key: string };
};
const cryptoMath = Object.create(Math) as Math;
cryptoMath.random = () => randomBytes(6).readUIntBE(0, 6) / 281474976710656;
const codec = new Script(`${CODEC_SOURCE}; ({encode:iE,encodeToken:oE,newSessionValue:kE,serialize:s,shuffle:L,uuid:g,
  wire:{substitution:ca,alphabet:_Z.join(''),padding:MZ,key:h[165]}})`).runInNewContext(
  { Math: cryptoMath },
  { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } },
) as Codec;

export const WATCHMAN_BUILD_VERSION = '3.0.0_33d41777';
/** SDK la: the API form version, separate from the packet's $a metadata. */
export const WATCHMAN_API_VERSION = '33d41777';
export const WATCHMAN_WIRE_VERSION = 'b4dff407';
export interface WatchmanForm { path: '/v3/d' | '/v3/b'; body: string; callback: string }
export interface UrsAnticheatOptions {
  /** Public productNumber supplied by the fresh official getconf response. */
  productNumber: string;
  /** Must agree with the HTTP client's declared User-Agent. */
  userAgent?: string;
  language?: string;
  /** Resume the same cache branch used by the official SDK when device IDs already exist. */
  device?: WatchmanDeviceState;
}

/** Decode and bind a captured /b packet to /get's acToken; no captured proof is sent. */
export function importWatchmanDevice(form: string, acToken: string, transportId: string): WatchmanDeviceState | undefined {
  const encrypted = new URLSearchParams(form).get('d');
  if (!encrypted) throw new Error('HAR 缺少 Watchman 设备请求');
  const bytes = decodeUrsPacket(encrypted, {
    ...codec.wire,
    undo: (value, i) => (((value - 54 + i) & 255) ^ ((-73 + i) & 255)) + 87 - i,
  });
  const fields: WatchmanFields = {};
  for (let offset = 0; offset < bytes.length;) {
    const id = bytes.readUInt16BE(offset), length = bytes.readUInt16BE(offset + 2);
    const entry = Object.entries(SCHEMA).find(([, spec]) => spec.c === id);
    const data = bytes.subarray(offset + 4, offset + 4 + length);
    if (data.length !== length) throw new Error('HAR Watchman 字段长度无效');
    if (entry) {
      const [name, spec] = entry;
      if (spec.a === 'STRING') fields[name] = data.toString();
      else if (spec.a === 'NUMBER') fields[name] = length ? data.readUIntBE(0, length) : 0;
      else if (spec.a === 'BOOLEAN') fields[name] = data[0] === 1;
      else if (spec.a === 'ARRAY') {
        let at = 0;
        fields[name] = (spec.e as number[]).map(size => {
          const value = data.readUIntBE(at, size); at += size; return value;
        });
      }
    }
    offset += length + 4;
  }
  if (fields.Oa !== WATCHMAN_BUILD_VERSION || fields.$a !== WATCHMAN_WIRE_VERSION || fields.Ya !== META.Ya) {
    throw new Error('HAR 的 Watchman 版本与当前协议实现不一致');
  }
  if (codec.encodeToken(JSON.stringify({ r: 1, d: fields.cb, b: fields.Ma })) !== acToken) return undefined;
  if (typeof fields.cb !== 'string' || !fields.cb || typeof fields.Kb !== 'string' || !fields.Kb) {
    throw new Error('HAR 的 Watchman 设备标识缺失');
  }
  const select = (names: string[]): WatchmanFields => Object.fromEntries(names.map(name => {
    if (fields[name] === undefined) throw new Error(`HAR 设备档案缺少 ${name}`);
    return [name, fields[name]];
  }));
  return {
    productNumber: fields.Kb, deviceId: fields.cb, transportId,
    environment: select(['nb', 'hb', 'Eb', 'gb', 'Xb', 'wb']),
    // Only page structure is retained. Request timing and event counters are generated anew.
    page: select(['sb', 'kb', 'vb', 'Ob', 'qb', 'Wb', 'yb', 'Tb', 'rb', 'Sa', 'Qb']),
  };
}

function checkedString(value: unknown, maximum = 512): string {
  if (typeof value !== 'string' || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('Invalid Watchman field shape');
  }
  return value;
}
function serialize(fields: Record<string, unknown>): number[] {
  const result: number[] = [];
  for (const key of codec.shuffle(Object.keys(fields))) {
    const spec = SCHEMA[key];
    if (!spec) throw new Error('Unsupported Watchman field');
    const value = fields[key];
    if (spec.a === 'STRING' || spec.a === 'HEX') checkedString(value, 2048);
    if (spec.a === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('Invalid Watchman numeric field');
    }
    if (spec.a === 'BOOLEAN' && typeof value !== 'boolean') throw new Error('Invalid Watchman flag');
    result.push(...codec.serialize(value, spec));
  }
  if (result.length > 16_384) throw new Error('Watchman packet resource limit');
  return result;
}

/** Strictly unwrap the requested JSONP callback; returns values only to caller. */
export function parseWatchmanResponse(text: string, callback: string): unknown[] {
  if (!/^__wmjsonp_[a-f0-9]{7}$/.test(callback) || text.length > 16_384) {
    throw new Error('Invalid Watchman response shape');
  }
  const pattern = new RegExp(`^\\s*${callback}\\((.*)\\)\\s*;?\\s*$`, 's');
  const match = pattern.exec(text);
  if (!match) throw new Error('Watchman callback mismatch');
  let value: unknown;
  try { value = JSON.parse(match[1]!); } catch { throw new Error('Invalid Watchman response JSON'); }
  if (!Array.isArray(value) || !Number.isSafeInteger(value[0])) {
    throw new Error('Invalid Watchman response fields');
  }
  return value;
}

/**
 * New request state with optional imported device cache. Captured timestamps,
 * behavior events, request nonces and CAPTCHA proofs are never resumed.
 * Caller sends only /v3/d and /v3/b and must validate every server response.
 */
export class UrsAnticheatSession {
  #options: Required<Omit<UrsAnticheatOptions, 'device'>>;
  #device: WatchmanDeviceState | undefined;
  #deviceId = '';
  #transportId = '';
  #count = 0;
  #offset = 0;
  #started = Date.now();
  #requestValue: string;
  #deviceReady = false;
  #behaviorReady = false;
  #pending: '/v3/d' | '/v3/b' | null = null;

  constructor(options: UrsAnticheatOptions) {
    const productNumber = checkedString(options.productNumber, 32);
    if (!productNumber) throw new Error('Watchman productNumber is required');
    this.#options = {
      productNumber,
      userAgent: checkedString(options.userAgent ?? `Node.js/${process.version} (${platform()}; ${arch()})`),
      language: checkedString(options.language ?? Intl.DateTimeFormat().resolvedOptions().locale, 64),
    };
    this.#requestValue = codec.newSessionValue();
    this.#device = options.device;
    if (this.#device) {
      if (this.#device.productNumber !== productNumber) throw new Error('设备档案与当前反作弊产品不匹配，请重新导入');
      this.#deviceId = this.#device.deviceId;
      this.#transportId = this.#device.transportId;
      this.#deviceReady = true;
    }
  }

  get deviceReady(): boolean { return this.#deviceReady; }

  #header(businessKey = ''): Record<string, unknown> {
    return {
      bc: '200', Lb: Math.min(++this.#count, 255), Db: codec.uuid(),
      Ub: Math.trunc((Date.now() + this.#offset) / 1000),
      Oa: WATCHMAN_BUILD_VERSION, Pa: businessKey, Ma: this.#requestValue,
      Zb: this.#transportId, cb: this.#deviceId, Kb: this.#options.productNumber,
      ...META,
    };
  }

  #environment(): Record<string, unknown> {
    if (this.#device) return { ...this.#device.environment };
    // The SDK's hb field searches an exception stack; it is not the runtime name.
    const stack = new Error().stack ?? '';
    const stackMarker = ['phantomjs', 'rhino', 'nodejs', 'couchjs', 'selenium']
      .find(marker => stack.includes(marker)) ?? '';
    return {
      // Ja: official runtime/prototype checks. Eb=1 means no document.
      nb: false, hb: stackMarker, Eb: 1, gb: 0, Xb: 10, wb: false,
    };
  }

  #profile(): Record<string, unknown> {
    const nativeNavigator = globalThis.navigator;
    const ua = this.#options.userAgent.toLowerCase();
    const deviceClass = /windows phone|android|iphone|ipad/.test(ua) ? 3 : /win|linux|mac/.test(ua) ? 2 : 1;
    return {
      $b: this.#options.userAgent, zb: this.#options.language,
      Ta: 0, bb: 0, Vb: Math.floor(new Date().getTimezoneOffset() / 60 * -1 + 12),
      Pb: false, Cb: false, tb: false, Ea: false, Fb: false,
      Va: '', Ib: nativeNavigator?.platform ?? '', eb: 'unknown', Jb: '', Qa: '',
      Da: false, pb: false, ob: false, Yb: false, Mb: deviceClass,
      Ua: false, xb: false, Fa: '', Ga: '', Ha: '', Ia: '',
      Ab: this.#options.language, Sb: '', ac: '', Na: '', Gb: `${platform()} ${arch()}`,
      fb: '', mb: nativeNavigator?.hardwareConcurrency ?? cpus().length, Nb: [0, 0, 0, 0], La: '',
      // Fonts and WebGL fields are disabled by the official default options.
    };
  }

  #form(path: '/v3/d' | '/v3/b', packets: Record<string, unknown>[]): WatchmanForm {
    if (this.#pending) throw new Error('Watchman request already pending');
    const bytes = packets.flatMap(serialize);
    const d = codec.encode(bytes);
    const callback = `__wmjsonp_${randomBytes(4).toString('hex').slice(0, 7)}`;
    this.#pending = path;
    return { path, callback, body: new URLSearchParams({ d, v: WATCHMAN_API_VERSION, cb: callback }).toString() };
  }

  buildDeviceForm(): WatchmanForm {
    if (this.#deviceReady) throw new Error('Watchman device already initialized');
    return this.#form('/v3/d', [this.#header(), this.#profile(), this.#environment()]);
  }

  /** Returns 420 when official SDK would update clock and repeat initialization. */
  acceptDeviceResponse(response: unknown[]): 200 | 420 {
    if (this.#pending !== '/v3/d') throw new Error('No matching Watchman device request');
    this.#pending = null;
    const code = response[0];
    if (code !== 200 && code !== 420) throw new Error('Watchman device initialization rejected');
    const transportId = checkedString(response[2], 256);
    const deviceId = checkedString(response[3], 256);
    if (!transportId || !deviceId) throw new Error('Watchman device response missing fresh identifiers');
    this.#transportId = transportId;
    this.#deviceId = deviceId;
    if (code === 420) this.#setClock(response[1]);
    this.#deviceReady = code === 200;
    return code;
  }

  buildBehaviorForm(businessKey: string): WatchmanForm {
    if (this.#pending) throw new Error('Watchman request already pending');
    if (!this.#deviceReady) throw new Error('Fresh Watchman device initialization is required');
    checkedString(businessKey, 32);
    if (!businessKey) throw new Error('Watchman businessKey is required');
    const now = Date.now();
    const delta = now - this.#started;
    this.#started = now;
    this.#requestValue = codec.newSessionValue();
    this.#behaviorReady = false;
    // Keep cached page structure, with new elapsed time and no copied user events.
    const page = { sb: 0, kb: 0, vb: 0, Ob: 0, qb: 0, Wb: '', yb: '', Tb: 0, rb: 0,
      Sa: [0, 0], Qb: true, ...this.#device?.page,
      ub: 0, lb: [0, 0, 0, 0, 0], Hb: [0, 0, 0], cc: delta };
    return this.#form('/v3/b', [this.#header(businessKey), this.#environment(), page]);
  }

  acceptBehaviorResponse(response: unknown[]): 200 | 420 {
    if (this.#pending !== '/v3/b') throw new Error('No matching Watchman behavior request');
    this.#pending = null;
    const code = response[0];
    if (code !== 200 && code !== 420) throw new Error('Watchman behavior collection rejected');
    const transportId = checkedString(response[2], 256);
    if (!transportId) throw new Error('Watchman behavior response missing fresh identifier');
    this.#transportId = transportId;
    if (code === 420) this.#setClock(response[1]);
    this.#behaviorReady = code === 200;
    if (this.#device) this.#device.transportId = transportId;
    return code;
  }

  #setClock(value: unknown): void {
    if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Invalid Watchman clock');
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) throw new Error('Invalid Watchman clock');
    this.#offset = time - Date.now();
  }

  /** Called only after both fresh initialization and successful behavior response. */
  getToken(): string {
    if (!this.#deviceReady || !this.#behaviorReady) throw new Error('Watchman token is not verified');
    // Official successful pE branch, with no synthesized timeout t fallback.
    return codec.encodeToken(JSON.stringify({ r: 1, d: this.#deviceId, b: this.#requestValue }));
  }

  cancelPending(): void { this.#pending = null; this.#behaviorReady = false; }
}
