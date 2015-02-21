var Turnstile = require('./index.js');
var t = null;


describe("Creates instance and connects to db",function(){
  it("Creates Turnstile instance",function(){
    t = new Turnstile();
    expect(t).not.toBeNull();
  });
});
