# A new attempt at sanely managing mesh data.
# Wraps around a single ArrayBuffer with helper methods.
# Must be initialized with a known vertex count.
# Does not reallocate storage space because it's slow.

class Jax.Mesh.Data
  # Returns the smallest unsigned int typed array that can hold
  # the specified number of vertices. Smaller arrays are generally faster.
  chooseIndexArrayFormat = (length) ->
    if @length < 256 then return Uint8Array
    else if @length < 65536 then return Uint16Array
    Uint32Array
    
  # Returns the calculated length of the ArrayBuffer in bytes for the specified
  # number of vertices and its vertex index buffer.
  calcByteLength = (numVerts, numIndices, indexFormat) ->
    numVerts * 6 * Float32Array.BYTES_PER_ELEMENT + # vertices, normals
    numVerts * 2 * Float32Array.BYTES_PER_ELEMENT + # textures
    numVerts * 4 * Uint8Array.BYTES_PER_ELEMENT +   # colors
    numIndices * indexFormat.BYTES_PER_ELEMENT      # indices
  
  constructor: (vertices = [], colors = [], textures = [], normals = [], indices = []) ->
    throw new Error "Vertex data length must be given in multiples of 3" if vertices % 3
    # build up indices if none were given
    @allocateBuffers vertices.length, indices.length
    (indices.push i for i in [0...@length]) if indices.length == 0
    @vertices = new Array @length
    @assignVertexData vertices, colors, textures, normals
    @originalColors = (c for c in @colorBuffer)
    @indices = indices
    @usage = GL_STATIC_DRAW
    @target = GL_ARRAY_BUFFER
    
  @define 'indices'
    set: (indices) -> @indexBuffer[i] = indices[i] for i in [0...indices.length]
    
  @define 'color'
    set: (color) ->
      @_color = Jax.Color.parse color
      for i in [0...@colorBuffer.length] by 4
        @colorBuffer[i  ] = (@originalColors[i  ] + @_color.red)   * 0.5
        @colorBuffer[i+1] = (@originalColors[i+1] + @_color.green) * 0.5
        @colorBuffer[i+2] = (@originalColors[i+2] + @_color.blue)  * 0.5
        @colorBuffer[i+3] = (@originalColors[i+3] + @_color.alpha) * 0.5
    
  allocateBuffers: (numVertices, numIndices) ->
    @length = numVertices / 3
    @indexFormat = chooseIndexArrayFormat @length
    byteLength = calcByteLength @length, numIndices, @indexFormat
    @_array_buffer = new ArrayBuffer byteLength
    @vertexBufferOffset = 0
    @vertexBuffer = new Float32Array @_array_buffer, @vertexBufferOffset, @length * 3
    @colorBufferOffset = @vertexBufferOffset + Float32Array.BYTES_PER_ELEMENT * @length * 3
    @colorBuffer = new Uint8Array @_array_buffer, @colorBufferOffset, @length * 4
    @textureCoordsBufferOffset = @colorBufferOffset + Uint8Array.BYTES_PER_ELEMENT * @length * 4
    @textureCoordsBuffer = new Float32Array @_array_buffer, @textureCoordsBufferOffset, @length * 2
    @normalBufferOffset = @textureCoordsBufferOffset + Float32Array.BYTES_PER_ELEMENT * @length * 2
    @normalBuffer = new Float32Array @_array_buffer, @normalBufferOffset, @length * 3
    @indexBufferOffset = @normalBufferOffset + Float32Array.BYTES_PER_ELEMENT * @length * 3
    @indexBuffer = new @indexFormat @_array_buffer, @indexBufferOffset, numIndices

  tmpvec3 = vec3.create()
  assignVertexData: (vertices, colors, textures, normals) ->
    # cache some variables for slightly faster runtime
    [_vertices, _vbuf, _nbuf, _cbuf, _tbuf] = [@vertices, @vertexBuffer, @normalBuffer, @colorBuffer, @textureCoordsBuffer]
    [_vofs, _nofs, _cofs, _tofs] = [@vertexBufferOffset, @normalBufferOffset, @colorBufferOffset, @textureCoordsBufferOffset]
    _vsize = 3 * Float32Array.BYTES_PER_ELEMENT
    _tsize = 2 * Float32Array.BYTES_PER_ELEMENT
    _csize = 4 * Uint8Array.BYTES_PER_ELEMENT
    _array_buffer = @_array_buffer
    length = @length
    
    for ofs in [0...length]
      _vertices[ofs] =
        position: new Float32Array _array_buffer, _vofs + ofs * _vsize, 3
        normal: new Float32Array   _array_buffer, _nofs + ofs * _vsize, 3
        color: new Uint8Array      _array_buffer, _cofs + ofs * _csize, 4
        texture: new Float32Array  _array_buffer, _tofs + ofs * _tsize, 2
      [vofs, cofs, tofs] = [ofs * 3, ofs * 4, ofs * 2]
      _vbuf[vofs  ]  = vertices[vofs  ]
      _vbuf[vofs+1]  = vertices[vofs+1]
      _vbuf[vofs+2]  = vertices[vofs+2]
      if normals.length <= vofs
        tmpvec3[0] = vertices[vofs]
        tmpvec3[1] = vertices[vofs+1]
        tmpvec3[2] = vertices[vofs+2]
        vec3.normalize tmpvec3
        _nbuf[vofs  ] = tmpvec3[0]
        _nbuf[vofs+1] = tmpvec3[1]
        _nbuf[vofs+2] = tmpvec3[2]
      else
        _nbuf[vofs  ]  = normals[vofs  ]
        _nbuf[vofs+1]  = normals[vofs+1]
        _nbuf[vofs+2]  = normals[vofs+2]
      if colors.length <= cofs
        _cbuf[cofs] = _cbuf[cofs+1] = _cbuf[cofs+2] = _cbuf[cofs+3] = 255
      else
        _cbuf[cofs  ]   = colors[cofs  ]
        _cbuf[cofs+1]   = colors[cofs+1]
        _cbuf[cofs+2]   = colors[cofs+2]
        _cbuf[cofs+3]   = colors[cofs+3]
      if textures.length <= tofs
        _tbuf[tofs] = _tbuf[tofs+1] = 0
      else
        _tbuf[tofs  ] = textures[tofs  ]
        _tbuf[tofs+1] = textures[tofs+1]
