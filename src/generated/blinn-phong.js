Jax.shaders['blinn-phong'] = new Jax.Shader({  common:"<% for (var i = 0; i < textures.length; i++) { %>\n  uniform sampler2D TEXTURE<%=i%>;\n  uniform int TEXTURE<%=i%>_TYPE;\n  uniform vec2 TEXTURE<%=i%>_SCALE;\n  uniform vec2 TEXTURE<%=i%>_OFFSET;\n<% } %>\n\n/* matrix uniforms */\nuniform mat4 mMatrix, ivMatrix, mvMatrix, pMatrix;\nuniform mat3 vnMatrix, nMatrix;\n\n/* material uniforms */\nuniform vec4 materialDiffuse, materialAmbient, materialSpecular;\nuniform float materialShininess;\n      \nuniform int PASS_TYPE;\n      \n/* light uniforms */\nuniform vec3 LIGHT_DIRECTION, LIGHT_POSITION;\nuniform vec4 LIGHT_SPECULAR, LIGHT_AMBIENT, LIGHT_DIFFUSE;\nuniform bool LIGHT_ENABLED;\nuniform int LIGHT_TYPE;\nuniform float SPOTLIGHT_COS_CUTOFF, SPOTLIGHT_EXPONENT, LIGHT_ATTENUATION_CONSTANT, LIGHT_ATTENUATION_LINEAR,\n              LIGHT_ATTENUATION_QUADRATIC;\n      \n/* shadow map uniforms */\nuniform bool SHADOWMAP_ENABLED;\nuniform sampler2D SHADOWMAP0, SHADOWMAP1;\nuniform mat4 SHADOWMAP_MATRIX;\nuniform bool SHADOWMAP_PCF_ENABLED;\nuniform float DP_SHADOW_NEAR, DP_SHADOW_FAR;\n\nvarying vec2 vTexCoords;\nvarying vec3 vNormal, vLightDir, vSpotlightDirection, vTbnDirToLight;\nvarying vec3 vTangent, vBitangent;\nvarying vec4 vBaseColor, vShadowCoord;\nvarying float vDist;\n      \nvarying vec3 vDP0, vDP1;\nvarying float vDPz, vDPDepth;\n",
  fragment:"float LightAttenuation;\n      \nvec4 pack_depth(const in float depth)\n{\n  const vec4 bit_shift = vec4(256.0*256.0*256.0, 256.0*256.0, 256.0, 1.0);\n  const vec4 bit_mask  = vec4(0.0, 1.0/256.0, 1.0/256.0, 1.0/256.0);\n  vec4 res = fract(depth * bit_shift);\n  res -= res.xxyz * bit_mask;\n  return res;\n}\n\n/*\nfloat linearize(in float z) {\n  float A = pMatrix[2].z, B = pMatrix[3].z;\n  float n = - B / (1.0 - A); // camera z near\n  float f =   B / (1.0 + A); // camera z far\n  return (2.0 * n) / (f + n - z * (f - n));\n}\n*/\n\nfloat unpack_depth(const in vec4 rgba_depth)\n{\n  const vec4 bit_shift = vec4(1.0/(256.0*256.0*256.0), 1.0/(256.0*256.0), 1.0/256.0, 1.0);\n  float depth = dot(rgba_depth, bit_shift);\n  return depth;\n}\n\n\n\nfloat dp_lookup() {\n  float map_depth, depth;\n  vec4 rgba_depth;\n      \n  if (vDPz > 0.0) {\n    rgba_depth = texture2D(SHADOWMAP0, vDP0.xy);\n    depth = vDPDepth;//P0.z;\n  } else {\n    rgba_depth = texture2D(SHADOWMAP1, vDP1.xy);\n    depth = vDPDepth;//P1.z;\n  }\n      \n      \n  map_depth = unpack_depth(rgba_depth);\n      \n  if (map_depth + 0.00005 < depth) return 0.0;\n  else return 1.0;\n}\n      \nfloat pcf_lookup(float s, vec2 offset) {\n  /*\n    s is the projected depth of the current vShadowCoord relative to the shadow's camera. This represents\n    a *potentially* shadowed surface about to be drawn.\n    \n    d is the actual depth stored within the SHADOWMAP texture (representing the visible surface).\n  \n    if the surface to be drawn is further back than the light-visible surface, then the surface is\n    shadowed because it has a greater depth. Less-or-equal depth means it's either in front of, or it *is*\n    the light-visible surface.\n  */\n  float d = unpack_depth(texture2D(SHADOWMAP0, (vShadowCoord.xy/vShadowCoord.w)+offset));\n  return (s - d > 0.00002) ? 0.0 : 1.0;\n}\n      \nvoid main() {\n  vec3 nTbnDirToLight;// = normalize(vTbnDirToLight);\n  vec4 final_color = vec4(0,0,0,0);\n  float spotEffect, att = 1.0, visibility = 1.0;\n      \n  if (PASS_TYPE == <%=Jax.Scene.ILLUMINATION_PASS%>) {\n    if (LIGHT_ENABLED) {\n      LightAttenuation = (LIGHT_ATTENUATION_CONSTANT \n                         + LIGHT_ATTENUATION_LINEAR    * vDist\n                         + LIGHT_ATTENUATION_QUADRATIC * vDist * vDist);\n      \n      if (SHADOWMAP_ENABLED) {\n        float s = vShadowCoord.z / vShadowCoord.w;\n        if (LIGHT_TYPE == <%=Jax.POINT_LIGHT%>) {\n          visibility = dp_lookup();\n        } else {\n          if (!SHADOWMAP_PCF_ENABLED)\n            visibility = pcf_lookup(s, vec2(0.0,0.0));\n          else {\n            /* do PCF filtering */\n            float dx, dy;\n            visibility = 0.0;\n            for (float dx = -1.5; dx <= 1.5; dx += 1.0)\n              for (float dy = -1.5; dy <= 1.5; dy += 1.0)\n                visibility += pcf_lookup(s, vec2(dx/2048.0, dy/2048.0));\n            visibility /= 16.0;\n          }\n        }\n      }\n\n      vec3 nLightDir = normalize(vLightDir), nNormal = normalize(vNormal);\n      vec3 halfVector = normalize(nLightDir + vec3(0.0,0.0,1.0));\n      float NdotL = max(dot(nNormal, nLightDir), 0.0);\n      nTbnDirToLight.x = dot(vLightDir, normalize(vTangent));  \n      nTbnDirToLight.y = dot(vLightDir, normalize(vBitangent));  \n      nTbnDirToLight.z = dot(vLightDir, nNormal);\n      nTbnDirToLight = normalize(nTbnDirToLight);\n\n\n      if (LIGHT_TYPE != <%=Jax.SPOT_LIGHT%> || \n        (spotEffect = dot(normalize(vSpotlightDirection), nLightDir)) > SPOTLIGHT_COS_CUTOFF\n      ) {\n        if (LIGHT_TYPE != <%=Jax.DIRECTIONAL_LIGHT%>) {\n          if (LIGHT_TYPE == <%=Jax.SPOT_LIGHT%>) { att = pow(spotEffect, SPOTLIGHT_EXPONENT); }\n        \n          att = att / LightAttenuation;\n        }\n        \n        final_color += visibility * att * LIGHT_AMBIENT;\n        if (NdotL > 0.0) {\n          float NdotHV = max(dot(nNormal, halfVector), 0.0);\n          final_color += visibility * att * NdotL * materialDiffuse * LIGHT_DIFFUSE; /* diffuse */\n          final_color += visibility * att * materialSpecular * LIGHT_SPECULAR * pow(NdotHV, materialShininess); /* specular */\n        }\n      }\n\n      vec3 tn;\n      <% for (var i = 0; i < textures.length; i++) { %>\n          if (TEXTURE<%=i%>_TYPE == <%=Jax.NORMAL_MAP%>) {\n            tn = normalize(texture2D(TEXTURE<%=i%>, vTexCoords * TEXTURE<%=i%>_SCALE + TEXTURE<%=i%>_OFFSET).xyz * 2.0 - 1.0);\n            final_color *= max(dot(nTbnDirToLight, tn), 0.0);\n          }\n          else\n            final_color *= texture2D(TEXTURE<%=i%>, vTexCoords * TEXTURE<%=i%>_SCALE + TEXTURE<%=i%>_OFFSET);\n      <% } %>\n    }\n  } else {\n    final_color += materialAmbient * vBaseColor;\n    <% for (var i = 0; i < textures.length; i++) { %>\n        final_color *= vec4(1,1,1,texture2D(TEXTURE<%=i%>, vTexCoords * TEXTURE<%=i%>_SCALE + TEXTURE<%=i%>_OFFSET).a);\n    <% } %>\n  }\n      \n  gl_FragColor = final_color;\n}\n",
  vertex:"/* attributes */\nattribute vec2 VERTEX_TEXCOORDS;\nattribute vec4 VERTEX_POSITION, VERTEX_COLOR, VERTEX_TANGENT;\nattribute vec3 VERTEX_NORMAL;\n \nvoid calculateDPLighting() {\n//        vShadowCoord = mvMatrix * vec4(VERTEX_POSITION.xyz, 1.0);\n  vec4 p = vShadowCoord;\n  vec3 pos = p.xyz / p.w;\n        \n  float L = length(pos.xyz);\n  vDP0 = pos / L;\n  vDP1 = pos / L;\n        \n  vDPz = pos.z;\n        \n  vDP0.z = 1.0 + vDP0.z;\n  vDP0.x /= vDP0.z;\n  vDP0.y /= vDP0.z;\n  vDP0.z = (L - DP_SHADOW_NEAR) / (DP_SHADOW_FAR - DP_SHADOW_NEAR);\n        \n  vDP0.x =  0.5 * vDP0.x + 0.5;\n  vDP0.y =  0.5 * vDP0.y + 0.5;\n        \n  vDP1.z = 1.0 - vDP1.z;\n  vDP1.x /= vDP1.z;\n  vDP1.y /= vDP1.z;\n  vDP1.z = (L - DP_SHADOW_NEAR) / (DP_SHADOW_FAR - DP_SHADOW_NEAR);\n    \n  vDP1.x =  0.5 * vDP1.x + 0.5;\n  vDP1.y =  0.5 * vDP1.y + 0.5;\n        \n  float map_depth, depth;\n  vec4 rgba_depth;\n        \n  if (vDPz > 0.0) {\n    vDPDepth = vDP0.z;\n  } else {\n    vDPDepth = vDP1.z;\n  }\n}\n      \nvoid main() {\n  vBaseColor = VERTEX_COLOR;\n  vNormal = nMatrix * VERTEX_NORMAL;\n  vTexCoords = VERTEX_TEXCOORDS;\n      \n  /* if it's an ambient pass, then we don't even care about light information */\n  if (PASS_TYPE == <%=Jax.Scene.ILLUMINATION_PASS%>) {\n    if (SHADOWMAP_ENABLED) {\n      vShadowCoord = SHADOWMAP_MATRIX * mMatrix * VERTEX_POSITION;\n    }\n          \n    if (LIGHT_TYPE == <%=Jax.DIRECTIONAL_LIGHT%>) {\n      vLightDir = normalize(vnMatrix * -LIGHT_DIRECTION);\n    } else {\n      if (LIGHT_TYPE == <%=Jax.POINT_LIGHT%>) calculateDPLighting();\n      vec3 vec = (ivMatrix * vec4(LIGHT_POSITION, 1)).xyz - (mvMatrix * VERTEX_POSITION).xyz;\n      vLightDir = normalize(vec);\n      vDist = length(vec);\n    }\n      \n    /* tangent info for normal mapping */\n    vTangent = nMatrix * VERTEX_TANGENT.xyz;\n    vBitangent = cross(vNormal, vTangent) * VERTEX_TANGENT.w; // w is handedness\n          \n    /* if it's a spotlight, calculate spotlightDirection */\n    if (LIGHT_TYPE == <%=Jax.SPOT_LIGHT%>) {\n      vSpotlightDirection = normalize(vnMatrix * -LIGHT_DIRECTION);\n    }\n  }\n      \n  gl_Position = pMatrix * mvMatrix * vec4(VERTEX_POSITION.xyz, 1);\n}\n",
name: "blinn-phong"});
