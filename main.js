const electron = require('electron')
// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow
const path = require('path')
const url = require('url')
const fs = require('fs-extra')

let mainWindow
let saveState

function createWindow(){
  var data = null;
  try { data = fs.readJsonSync('./init.json', {throws: false}); }catch(e){}
  // set windowOptions
  windowManager.windowOptions = data ? windowManager.merge(windowManager.defaultOptions, data) : windowManager.defaultOptions;
  console.log( windowManager.windowOptions );
  // Create the browser window.
  mainWindow = new BrowserWindow( windowManager.windowOptions );
  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'app/index.html'),
    protocol: 'file:',
    slashes: true
  }));
  // Open the DevTools.
  //mainWindow.webContents.openDevTools();
  windowManager.listen();
};
app.on('ready', createWindow)
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})
// SAVE/LOAD window config
const windowManager = {
  defaultOptions: {
    icon: path.join(__dirname, 'app/img/icon_64.png'),
    width: 800,
    height: 600,
    frame: false
  },
  windowOptions: null,
  listen: function(){
    var self = this;
    mainWindow.on('move', function(data) {
      self.saveState()
    });
    mainWindow.on('resize', function(data) {
      self.saveState()
    });
    mainWindow.on('closed', function() {
      mainWindow = null;
    });
  },
  waiter: null,
  saveState: function(){
    var self = this;
    if( self.waiter ) clearTimeout( self.waiter );
    self.windowOptions = self.merge( self.windowOptions, mainWindow.getBounds() );
    self.waiter = setTimeout(function(){
      fs.outputJson('./init.json', self.windowOptions, function (err) {
        if( err ){
          console.log(err);
          return
        }
        console.log(self.windowOptions);
      });
    },500);
  },
  merge: function(obj1,obj2){
    var obj3 = {};
    for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
    for (var attrname in obj2) {
      if( typeof obj1[attrname] === 'object' ){
        obj3[attrname] = nlHelpers.merge( obj1[attrname], obj2[attrname]);
      }else{
        obj3[attrname] = obj2[attrname];
      }
    }
    return obj3;
  }
}