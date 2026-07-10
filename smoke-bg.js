(function() {
  // --- FRAGMENT SHADER (PORTED WITH ALPHA BLENDING) ---
  const fragmentShaderSource = `#version 300 es
  precision highp float;
  out vec4 O;
  uniform float time;
  uniform vec2 resolution;
  uniform vec3 u_color;

  #define FC gl_FragCoord.xy
  #define R resolution
  #define T (time+660.)

  float rnd(vec2 p){p=fract(p*vec2(12.9898,78.233));p+=dot(p,p+34.56);return fract(p.x*p.y);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(rnd(i),rnd(i+vec2(1,0)),u.x),mix(rnd(i+vec2(0,1)),rnd(i+1.),u.x),u.y);}
  float fbm(vec2 p){float t=.0,a=1.;for(int i=0;i<5;i++){t+=a*noise(p);p*=mat2(1,-1.2,.2,1.2)*2.;a*=.5;}return t;}

  void main(){
    vec2 uv=(FC-.5*R)/R.y;
    vec3 col=vec3(1);
    uv.x+=.25;
    uv*=vec2(2,1);

    float n=fbm(uv*.28-vec2(T*.01,0));
    n=noise(uv*3.+n*2.);

    col.r-=fbm(uv+vec2(0,T*.015)+n);
    col.g-=fbm(uv*1.003+vec2(0,T*.015)+n+.003);
    col.b-=fbm(uv*1.006+vec2(0,T*.015)+n+.006);

    // Apply custom uniform color tint
    col=mix(col, u_color, dot(col,vec3(.21,.71,.07)));
    col=mix(vec3(.08),col,min(time*.1,1.));
    col=clamp(col,.08,1.);

    // ALPHA CHANNEL COMPUTATION (Zero opacity for base color, translucent up to 75% for smoke swirls)
    float intensity = dot(col, vec3(.21,.71,.07));
    float alpha = clamp((intensity - 0.08) * 2.5, 0.0, 0.75);

    O=vec4(col, alpha);
  }`;

  const vertexShaderSource = `#version 300 es
  precision highp float;
  in vec4 position;
  void main(){gl_Position=position;}`;

  class SmokeBgRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext("webgl2", { alpha: true, depth: false, antialias: true });
      if (!this.gl) {
        console.warn("WebGL 2 not supported in this browser. Falling back gracefully.");
        return;
      }
      this.vertices = [-1, 1, -1, -1, 1, 1, 1, -1];
      this.color = [0.5, 0.5, 0.5]; // Default gray
      this.setup();
      this.init();
    }

    updateColor(rgb) {
      this.color = rgb;
    }

    updateScale() {
      if (!this.gl) return;
      const dpr = Math.max(1, window.devicePixelRatio);
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    compile(shader, source) {
      const gl = this.gl;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compiler info log:", gl.getShaderInfoLog(shader));
      }
    }

    setup() {
      const gl = this.gl;
      this.vs = gl.createShader(gl.VERTEX_SHADER);
      this.fs = gl.createShader(gl.FRAGMENT_SHADER);
      this.program = gl.createProgram();
      
      this.compile(this.vs, vertexShaderSource);
      this.compile(this.fs, fragmentShaderSource);
      
      gl.attachShader(this.program, this.vs);
      gl.attachShader(this.program, this.fs);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        console.error("WebGL program link error:", gl.getProgramInfoLog(this.program));
      }
    }

    init() {
      const gl = this.gl;
      if (!this.program) return;
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);

      const position = gl.getAttribLocation(this.program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      this.locResolution = gl.getUniformLocation(this.program, "resolution");
      this.locTime = gl.getUniformLocation(this.program, "time");
      this.locColor = gl.getUniformLocation(this.program, "u_color");
    }

    render(now = 0) {
      const gl = this.gl;
      if (!gl || !this.program) return;
      
      gl.clearColor(0, 0, 0, 0); // Completely transparent canvas buffer
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      
      gl.uniform2f(this.locResolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.locTime, now * 1e-3);
      gl.uniform3fv(this.locColor, this.color);
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    reset() {
      const gl = this.gl;
      if (!gl || !this.program) return;
      if (this.vs) { gl.detachShader(this.program, this.vs); gl.deleteShader(this.vs); }
      if (this.fs) { gl.detachShader(this.program, this.fs); gl.deleteShader(this.fs); }
      if (this.buffer) { gl.deleteBuffer(this.buffer); }
      gl.deleteProgram(this.program);
    }
  }

  // --- UTILITY: Hex to RGB ---
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255,
        ]
      : null;
  }

  // --- RUN BACKGROUND INITIALIZATION ---
  function initSmokeBackground() {
    // Avoid double initialization
    if (document.getElementById("smoke-bg-canvas")) return;

    // 1. Create canvas element
    const canvas = document.createElement("canvas");
    canvas.id = "smoke-bg-canvas";
    
    // Style background canvas container fixed behind content
    Object.assign(canvas.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "-100",
      pointerEvents: "none",
      display: "block"
    });

    // 2. Identify layout characteristics & set up default themes
    const isAdmin = window.location.pathname.toLowerCase().includes("admin.html");
    let defaultColorHex = "#ff5a00"; // Client-side Default: Esports Orange (#ff5a00)
    
    if (isAdmin) {
      defaultColorHex = "#9d4edd"; // Admin default: back-office neon purple
    }
    
    // Check page paths
    const path = window.location.pathname.toLowerCase();
    const isTournament = path.includes("tournament.html");
    const isBetsPage = path.includes("betting.html") || path.includes("my-bets.html") || path.endsWith("/");
    const isProfilePage = path.includes("profile.html");

    if (isTournament) {
      canvas.style.backgroundColor = "transparent";
      canvas.style.backgroundImage = "none";
      canvas.style.opacity = "0.35"; // Make the smoke more transparent

      document.documentElement.style.setProperty("background-image", "linear-gradient(to bottom, rgba(8, 9, 12, 0.5) 0%, rgba(8, 9, 12, 0.35) 40%, rgba(8, 9, 12, 0.55) 100%), url('assets/tour_bg.png')", "important");
      document.documentElement.style.setProperty("background-size", "cover", "important");
      document.documentElement.style.setProperty("background-position", "center top", "important");
      document.documentElement.style.setProperty("background-attachment", "fixed", "important");
      document.documentElement.style.setProperty("background-color", "#08090c", "important");
      
      document.body.style.setProperty("background", "transparent", "important");
      document.body.style.setProperty("background-image", "none", "important");
      document.body.style.setProperty("background-color", "transparent", "important");
    } else if (isBetsPage) {
      canvas.style.backgroundColor = "transparent";
      canvas.style.backgroundImage = "none";
      canvas.style.opacity = "0.35"; // Make the smoke more transparent

      document.documentElement.style.setProperty("background-image", "linear-gradient(to bottom, rgba(8, 9, 12, 0.5) 0%, rgba(8, 9, 12, 0.35) 40%, rgba(8, 9, 12, 0.55) 100%), url('assets/bets_bg.jpg')", "important");
      document.documentElement.style.setProperty("background-size", "cover", "important");
      document.documentElement.style.setProperty("background-position", "center top", "important");
      document.documentElement.style.setProperty("background-attachment", "fixed", "important");
      document.documentElement.style.setProperty("background-color", "#08090c", "important");

      document.body.style.setProperty("background", "transparent", "important");
      document.body.style.setProperty("background-image", "none", "important");
      document.body.style.setProperty("background-color", "transparent", "important");
    } else if (isProfilePage) {
      canvas.style.backgroundColor = "transparent";
      canvas.style.backgroundImage = "none";
      canvas.style.opacity = "0.35"; // Make the smoke more transparent

      document.documentElement.style.setProperty("background-image", "linear-gradient(to bottom, rgba(8, 9, 12, 0.5) 0%, rgba(8, 9, 12, 0.35) 40%, rgba(8, 9, 12, 0.55) 100%), url('assets/profile_bg.png')", "important");
      document.documentElement.style.setProperty("background-size", "cover", "important");
      document.documentElement.style.setProperty("background-position", "center center", "important");
      document.documentElement.style.setProperty("background-attachment", "fixed", "important");
      document.documentElement.style.setProperty("background-color", "#08090c", "important");

      document.body.style.setProperty("background", "transparent", "important");
      document.body.style.setProperty("background-image", "none", "important");
      document.body.style.setProperty("background-color", "transparent", "important");
    } else {
      // Set uniform deep dark solid color background for the canvas (NO wallpaper, NO gradient)
      canvas.style.backgroundColor = "#08090c";
      canvas.style.backgroundImage = "none";

      // 3. Clear body backgrounds to let WebGL shine through
      document.body.style.setProperty("background", "transparent", "important");
      document.body.style.setProperty("background-color", "transparent", "important");
      document.body.style.setProperty("background-image", "none", "important");
    }

    // 4. Inject canvas into document body
    document.body.insertBefore(canvas, document.body.firstChild);

    // 5. Check if data-smoke-color override is present on body
    const bodyOverrideColor = document.body.getAttribute("data-smoke-color");
    const activeColorHex = bodyOverrideColor || defaultColorHex;
    const activeColorRgb = hexToRgb(activeColorHex) || [1.0, 0.2, 0.2];

    // 6. Spawn and scale renderer
    const renderer = new SmokeBgRenderer(canvas);
    if (!renderer.gl) return; // Exit if WebGL2 not supported

    renderer.updateColor(activeColorRgb);
    renderer.updateScale();

    // 7. Attach listeners & running loop
    window.addEventListener("resize", () => renderer.updateScale());

    let animationId;
    function loop(now) {
      renderer.render(now);
      animationId = requestAnimationFrame(loop);
    }
    loop(0);

    // Cleanup reference in case page tries to rebuild
    window.destroySmokeBg = function() {
      cancelAnimationFrame(animationId);
      renderer.reset();
      canvas.remove();
    };
  }

  // Self-trigger as soon as DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSmokeBackground);
  } else {
    initSmokeBackground();
  }
})();
