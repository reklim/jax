//= require "core"

/**
 * class Jax.Mesh
 * 
 * Example:
 * 
 *     var mesh = new Jax.Mesh({
 *       init: function(vertices, colors, textureCoords, normals, indices) {
 *          // all of the arguments are arrays. If you don't intend to use one,
 *          // simply don't populate it with data. For instance, if your mesh
 *          // does not use vertex indices, don't add any data to the indices
 *          // array.
 *          
 *          // Colors will default to white if they are not populated.
 *          
 *          // A simple, red, opaque quad:
 *          vertices.push(-1, -1, 0); colors.push(1, 0, 0, 1);
 *          vertices.push(-1,  1, 0); colors.push(1, 0, 0, 1);
 *          vertices.push( 1,  1, 0); colors.push(1, 0, 0, 1);
 *          vertices.push( 1, -1, 0); colors.push(1, 0, 0, 1);
 *       }
 *     });
 *     
 * You can also subclass Mesh directly:
 * 
 *     var Quad = Jax.Class.create(Jax.Mesh, {
 *       init: function(vertices, colors, textureCoords, normals, indices) {
 *          // ...
 *       }
 *     });
 **/
Jax.Mesh = (function() {
  //= require "mesh/tangent_space"
  //= require "mesh/support"
  
  return Jax.Class.create({
    initialize: function(options) {
      this.buffers = {};

      /**
       * Jax.Mesh#material -> String | Jax.Material
       * This property represents the material that will be used to render this mesh. If
       * it is a string, Jax will find the material with this name in the material registry
       * using:
       * 
       *     Jax.Material.find(...).
       *     
       * If not specified, Jax.Mesh#default_material will be used instead.
       **/

      /**
       * Jax.Mesh#default_material -> String | Jax.Material
       * This property represents the material that will be used to render this mesh if #material
       * isn't given a value and the render options don't override the material. If
       * it is a string, Jax will find the material with this name in the material registry
       * using:
       * 
       *     Jax.Material.find(...).
       *     
       * This property can also be specified as a render option in order to specify a default
       * for a particular pass.
       **/
      this.default_material = "default";

      for (var i in options)
        this[i] = options[i];

      if (!this.draw_mode)
        this.draw_mode = GL_TRIANGLES;
    },
    
    /**
     * Jax.Mesh#setColor(red, green, blue, alpha) -> Jax.Mesh
     * Sets the color of this mesh. This will set the color at each vertex, regardless
     * of the original color of that vertex. The result will be that the entire mesh
     * takes on the specified color (not just a particular vertex).
     **/
    setColor: function(red, green, blue, alpha) {
      var colorBuffer = this.getColorBuffer();
      
      for (var i = 0; i < this.colors.length; i++) {
        if (arguments.length == 4) {
          this.colors[i].array[0] = red;
          this.colors[i].array[1] = green;
          this.colors[i].array[2] = blue;
          this.colors[i].array[3] = alpha;
        } else {
          for (var j = 0; j < 4; j++) {
            this.colors[i].array[j] = arguments[0][j];
          }
        }
      }

      colorBuffer.refresh();
      return this;
    },

    /**
     * Jax.Mesh#dispose() -> undefined
     * Frees the various WebGL buffers used by this mesh.
     **/
    dispose: function() {
      for (var i in this.buffers)
        this.buffers[i].dispose();
      this.built = false;
    },

    /**
     * Jax.Mesh#render(context[, options]) -> undefined
     * - context (Jax.Context): the Jax context to render this object to
     * - options (Object): a set of custom render options to override the defaults for this Mesh.
     * 
     * Options include:
     *   * *draw_mode* : a GL rendering enum, such as GL_TRIANGLES or GL_LINE_STRIP.
     *   * *material* : an instance of Jax.Material, or the name of a registered Jax material, to override
     *     the material associated with this mesh.
     **/
    render: function(context, options) {
      if (!this.isValid()) this.rebuild();
      options = this.getNormalizedRenderOptions(options);
      options.material.render(context, this, options);
    },
    
    getNormalizedRenderOptions: function(options) {
      var result = Jax.Util.normalizeOptions(options, {
        material: this.material,
        default_material: this.default_material,
        draw_mode: this.draw_mode || GL_TRIANGLES
      });
    
      if (!result.material) result.material = result.default_material;

      result.material = findMaterial(result.material);

      return result;
    },

    /**
     * Jax.Mesh#getVertexBuffer() -> Jax.VertexBuffer
     **/
    getVertexBuffer: function() { this.validate(); return this.buffers.vertex_buffer; },
    /**
     * Jax.Mesh#getColorBuffer() -> Jax.ColorBuffer
     **/
    getColorBuffer:  function() { this.validate(); return this.buffers.color_buffer;  },
    /**
     * Jax.Mesh#getIndexBuffer() -> Jax.ElementArrayBuffer
     **/
    getIndexBuffer:  function() { this.validate(); return this.buffers.index_buffer;  },
    /**
     * Jax.Mesh#getNormalBuffer() -> Jax.NormalBuffer
     **/
    getNormalBuffer: function() { this.validate(); return this.buffers.normal_buffer; },
    /**
     * Jax.Mesh#getTextureCoordsBuffer() -> Jax.TextureCoordsBuffer
     **/
    getTextureCoordsBuffer: function() { this.validate(); return this.buffers.texture_coords; },
    /**
     * Jax.Mesh#getTangentBuffer() -> Jax.NormalBuffer
     * Returns tangent normals for each normal in this Mesh. Used for normal / bump mapping.
     **/
    getTangentBuffer: function() {
      if (this.buffers.tangent_buffer) return this.buffers.tangent_buffer;
      return makeTangentBuffer(this);
    },

    /**
     * Jax.Mesh#rebuildTangentBuffer() -> Jax.NormalBuffer
     * Forces an immediate rebuild of the tangent buffer for this Mesh. Use this if you've changed
     * the vertex, normal or texture information to update the tangent vectors. If this step is
     * skipped, you'll notice strange artifacts when using bump mapping (because the tangents will
     * be pointing in the wrong direction).
     **/
    rebuildTangentBuffer: function() {
      return makeTangentBuffer(this);
    },
    
    /**
     * Jax.Mesh#validate() -> Jax.Mesh
     *
     * If this mesh is not valid (its #init method hasn't been called or needs to be called again),
     * the mesh will be rebuilt per +Jax.Mesh#rebuild+. This mesh is returned.
     **/
    validate: function() {
      if (!this.isValid()) this.rebuild();
      return this;
    },

    /**
     * Jax.Mesh#isValid() -> Boolean
     * 
     * Returns true if this mesh is valid. If the mesh is invalid, it will be rebuilt during the next call to
     * Jax.Mesh#render().
     **/
    isValid: function() { return !!this.built; },

    /**
     * Jax.Mesh#rebuild() -> undefined
     * 
     * Forces Jax to rebuild this mesh immediately. This will dispose of any WebGL buffers
     * and reinitialize them with a new call to this mesh's data init method. Note that this
     * is a very expensive operation and is *usually not* what you want.
     * 
     * If, for instance, you want to update the mesh with new vertex positions (say, for animation)
     * then you'd be much better off doing something like this:
     * 
     *     var vbuf = mesh.getVertexBuffer();
     *     vbuf.js.clear();
     *     for (var i = 0; i < newVertexData.length; i++)
     *       vbuf.push(newVertexData[i]);
     *     vbuf.refresh();
     * 
     **/
    rebuild: function() {
      this.dispose();

      var vertices = [], colors = [], textureCoords = [], normals = [], indices = [];
      if (this.init)
        this.init(vertices, colors, textureCoords, normals, indices);
      
      this.built = true;
      
      // mesh builder didn't set colors...default to this.color || white.
      if (colors.length == 0 || this.color) {
        if (!this.color) this.color = [1,1,1,1];
        for (var i = 0; i < vertices.length / 3; i++) {
          for (var j = 0; j < 4; j++)
            colors[i*4+j] = this.color[j];
        }
      }

      if (this.dataRegion) {
        // we don'y simply call data.set(vertices) because the data count may
        // have changed. Remapping will reallocate memory as needed.
        this.dataRegion.remap(this.vertexData,        vertices);
        this.dataRegion.remap(this.colorData,         colors);
        this.dataRegion.remap(this.textureCoordsData, textureCoords);
        this.dataRegion.remap(this.normalData,        normals);
        this.dataRegion.remap(this.indices,           indices);
      } else {
        // it's faster to preallocate a known number of bytes than it is to
        // let the data region adapt automatically
        this.dataRegion = new Jax.DataRegion(
          (vertices.length+colors.length+textureCoords.length+normals.length) * Float32Array.BYTES_PER_ELEMENT +
          indices.length * Uint16Array.BYTES_PER_ELEMENT
        );
        
        this.vertexData        = this.dataRegion.map(Float32Array, vertices);
        this.colorData         = this.dataRegion.map(Float32Array, colors);
        this.textureCoordsData = this.dataRegion.map(Float32Array, textureCoords);
        this.normalData        = this.dataRegion.map(Float32Array, normals);
        this.indices           = this.dataRegion.map(Uint16Array,  indices);
        
        this.vertices      = this.vertexData.group(3);
        this.colors        = this.colorData.group(4);
        this.textureCoords = this.textureCoordsData.group(2);
        this.normals       = this.normalData.group(3);

        // calculate bounds, assuming we have vertices
        if (vertices.length) calculateBounds(this, vertices);
      }
      
      if (this.vertices.length == 0) delete this.buffers.vertex_buffer;
      else if (!this.buffers.vertex_buffer)
        this.buffers.vertex_buffer  = new Jax.DataBuffer(GL_ARRAY_BUFFER, this.vertices);
        
      if (this.colors.length == 0) delete this.buffers.color_buffer;
      else if (!this.buffers.color_buffer)
        this.buffers.color_buffer   = new Jax.DataBuffer(GL_ARRAY_BUFFER, this.colors);
        
      if (this.normals.length == 0) delete this.buffers.normal_buffer;
      else if (!this.buffers.normal_buffer)
        this.buffers.normal_buffer  = new Jax.DataBuffer(GL_ARRAY_BUFFER, this.normals);
        
      if (this.textureCoords.length == 0) delete this.buffers.textureCoords;
      else if (!this.buffers.texture_coords)
        this.buffers.texture_coords = new Jax.DataBuffer(GL_ARRAY_BUFFER, this.textureCoords);
        
      if (this.indices.length == 0) delete this.buffers.index_buffer;
      else if (!this.buffers.index_buffer)
        this.buffers.index_buffer   = new Jax.DataBuffer(GL_ELEMENT_ARRAY_BUFFER, this.indices);

      if (this.after_initialize) this.after_initialize();
    }
  });
})();
