window.addEventListener("load", function() {
  var canvas = document.createElement("canvas");
  canvas.setAttribute("width", "600");
  canvas.setAttribute("height", "400");
  canvas.setAttribute("id", "canvas-element");
  document.body.appendChild(canvas);
}, false);

describe("Jax.Canvas", function() {
  var context;
  
  describe("with no routes", function() {
    beforeEach(function() { 
      Jax.routes.clear();
      context = new Jax.Context(document.getElementById("canvas-element"));
    });
    afterEach(function() { context.dispose(); });
  
    it("should keep a handle to canvas", function() {
      expect(context.canvas.id).toEqual("canvas-element");
    });
  
    it("should not be rendering, because there's no root controller", function() {
      expect(context.isRendering()).toBeFalsy();
    });
  });
  
  describe("with routes", function() {
    var controller;
    var action_called = 0, view_called = 0;
    
    beforeEach(function() {
      Jax.routes.clear();
      Jax.routes.root(Jax.Controller.create("welcome", {index: function() { action_called++; }}), "index");
      Jax.views.push("welcome/index", function() {
        this.glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        view_called++;
      });
      context = new Jax.Context(document.getElementById("canvas-element"));
    });
    afterEach(function() { context.dispose(); });
  
    it("should be rendering, because there's a controller", function() {
      expect(context.isRendering()).toBeTruthy();
    });
  });
});