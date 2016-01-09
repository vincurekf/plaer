var fs = require('fs');
var path = require('path');
var nodeDir = require('node-dir');
var _ = require('underscore');
var id3js = require('id3js');

var playerApp = angular.module('playerApp.controllers', ['ngRoute']);

playerApp.controller('AppCtrl', function($rootScope, $scope) {
	$rootScope.title = 'Listen';
});

playerApp.controller('ListCtrl', function($rootScope, $scope) {
	$rootScope.title = 'Browse';
	function initList(){
		if( !_.isEmpty( $rootScope.archive.files ) ){
			$rootScope.list.init();	
		}else{
			setTimeout( function(){
				initList();
			}, 250);
		}
	};
	initList();
});

playerApp.controller('SettingsCtrl', function($rootScope, $scope) {
	console.log( 'SettingsCtrl' );
	$rootScope.title = 'SettingsCtrl';
});
