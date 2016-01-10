var _ = require('underscore');

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
