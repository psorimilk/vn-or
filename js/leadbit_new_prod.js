/* eslint-disable indent */
(function () {
	'use strict';

	function LBError(source) {
		Error.call(this, source);
		this.name = 'LBError';
		this.message = 'An error occured while getting data from the source: ' + source;
		this.property = source;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, LBError);
		} else {
			this.stack = (new Error()).stack;
		}

	}

	LBError.prototype = Object.create(Error.prototype);

	var LB = function (params) {

		//Настройки для редиректов
		this.REDIRECTS = {
			host: 'ldbtb.com',
			hostsByCountries: {
				// de: 'ldbteg.com',
				// ru: 'ldbter.com',
				// sg: 'ldbtas.com',
				// br: 'ldbtsc.com',
				// id: 'ldbtai.com',
				// th: 'ldbtat.com',
				vn: 'ldbtav.com'
			},
			hostsByRegions: {
				// as: 'ldbtas.com',
				// eu: 'ldbteg.com',
				as: 'ldbtav.com'
			},
			nodes: {
				// de: ['de1', 'de2'],
				// ru: ['ru1', 'ru2'],
				// sg: ['sg1', 'sg2'],
				// br: ['br1', 'br2'],
				// id: ['id1', 'id2'],
				// th: ['th1', 'th2'],
				vn: ['vn3', 'vn4']
			},
			regions: {
				// as: ['th', 'vn', 'sg'],
				// eu: ['ru', 'de', 'br'],
				as: ['vn']
			}
		};

		//Свойства инициализированной страницы
		this.page = {
			iframe: window !== window.top,
			tid: this.queryGET('TID'),
			nodeId: this.queryGET('n'),
			isOldRedirect: this.checkOldRedirects()
		};

		/**
		 * Дефолтные параметры
		 * @type {object }
		 */

		this.params = $.extend({
			v1: false,
			localNodesChecked: false,
			countryNodeChecked: false,
			regionNodeChecked: false,
			globalNodeChecked: false,
			fullDataChecked: false,
			fallbackChecked: false,
			asyncRequests: false,
			localNodesCheckedIndex: 0,
			checkedHosts: [],
			comebacker: false,
			leadBitDomain: this.queryGET('host') ? 'http://' + this.queryGET('host') + '/' : 'http://lea' + 'dbit.biz/',
			formDomain: this.queryGET('form_host') ? 'http://' + this.queryGET('form_host') + '/' : 'http://lea' + 'dbit.com/',
			now: new Date().getTime(),
			commentSelector: '',
			isParked: false,
			currentUrl: document.location.hostname + document.location.pathname,
			apiUrl: 'http://' + document.location.hostname + document.location.pathname + 'api/',
			getToExtend: ['cb', 'fblp', 'lp', 'fbsop', 'gclid'] //send to hidden inputs form,
		}, params);

		if (window.location.hash === '#devmode') {
			this.params.leadBitDomain = this.queryGET('host') ? 'http://' + this.queryGET('host') + '/' : 'http://devt' + 'dbit.biz/';
			this.params.formDomain = this.queryGET('form_host') ? 'http://' + this.queryGET('form_host') + '/' : 'http://devt.lea' + 'dbit.com/';
		}

		this.params.currentUrl = this.params.currentUrl.replace(/\/$/, '');

		this.startApplication();
		if (this.params.commentSelector.length) {
			this.setCommentsDate(this.params.commentSelector);
		}
		this.checkTest();
	};

	LB.prototype = {

		/**
		 * Проверяем, старый это редирект или нет
		 * @returns {boolean}
		 */
		checkOldRedirects: function () {
			var tid = this.queryGET('TID');
			return tid && tid.length <= 24;
		},

		/**
		 * Отправка jsonp запросса
		 * @param {Object} params - параметры запроса
		 * @param {string} params.url - url запроса
		 * @param {function} params.error - действие при ошибке в запросе
		 * @param {function} params.success - действие при успешной загрузке
		 * @param {string} params.callback - коллбэк jsonp запросаиду
		 * @param {string} params.timeout - максимальное время запроса
		 */
		jsonp: function (params) {

			var script = document.createElement('script');
			var self = this;
			var url = params.url;


			if (params.callback) {
				url += '?callback=' + params.callback;
			} else {
				throw('Callback is not defined!');
			}

			if (params.data) {
				for (var key in params.data) {
					url += '&' + key + '=' + params.data[key];
				}
			}

			script.src = url;
			document.head.appendChild(script);

			script.onload = function (e) {
				clearTimeout(scriptLoading);
				setTimeout(function () {
					if (params.success) params.success(e, url);
					self.removeScript(script);
				}, 0)
			};

			script.onerror = function (e) {
				clearTimeout(scriptLoading);
				if (params.error) params.error(e, url);
				self.removeScript(script);
			};

			if (params.timeout) {
				var scriptLoading = setTimeout(function () {
					self.removeScript(script);
					params.error();
				}, params.timeout);
			}
		},

		startApplication: function () {
			var self = this;
			this.checkCountry(function () {
				self.checkAndSendRequests();
			});
		},


		/**
		 * Проверка значений и отправка запросов
		 */
		checkAndSendRequests: function () {
			var tid = this.page.tid;
			var nodeId = this.page.nodeId;
			var isOldRedirect = this.page.isOldRedirect;

			if (!tid && !nodeId && !this.params.asyncRequests) {
				console.log('%cAsync condition. Going to check all routes simultaneously', 'color:#3333ff; font-size:13px; font-weight:600;');
				this.params.asyncRequests = true;
			}

			if (isOldRedirect) {
				this.sendFallbackRequest();
				return false;
			}


			if (this.params.asyncRequests) {
				this.checkNodesAsync();
			} else {
				this.checkNodesInSequence();
			}
		},

		/**
		 * Отправка запроса на получение данных с новых нод
		 * @param host - основной хост
		 * @param nodeId - имя ноды ( если есть )
		 * @param tid - TID - если есть
		 * @returns {boolean}
		 */
		getData: function (host, nodeId, tid) {
			var data = {
				iframe: this.page.iframe
			};
			var urlNodeId = nodeId ? nodeId + '.' : '';
			var self = this;

			if (tid) data.TID = tid;
			if (nodeId) data.nodeId = nodeId;
			console.log(host);
			console.log(urlNodeId);
			console.log(data);

			var url = '//' + urlNodeId + host + '/tid';
			if (~this.params.checkedHosts.indexOf(url)) {
				console.log('%cThis host already was requested... Moving to the next', 'color:#ff3300; font-size:13px; font-weight: 600;');
				console.log(url);
				self.checkAndSendRequests();
				return false;
			}
			this.jsonp({
				url: url,
				data: data,
				callback: 'LeadBit.getDataCallback',
				timeout: 5000,
				success: function(){
					console.log('success');
					console.log('host', host);
					console.log('nodeId', nodeId);
					self.page.cookieDomain = host;
				},
				error: function (e, src) {
					if(self.page.dataRecieved) return false;
					console.log('%cError encountered! Trying to check another sources...', 'color:#ff3300; font-size:13px; font-weight: 600;');
					self.checkAndSendRequests();
					throw new LBError(src ? src : url);
				}
			});
			this.params.checkedHosts.push(url);
		},

		/**
		 * Коллбэк jsonp запроса Leadbit.getData()
		 * @param data1 - первый аргумент в ответе
		 * @param data2 - второй аргумент в ответе
		 * note: @velikan обещал оставить только один
		 */
		getDataCallback: function (data1, data2) {
			if (this.page.dataRecieved) return false;
			var data = $.extend(data1, data2);
			if (!data1 && !data2) {
				this.checkAndSendRequests();
				return false;
			}
			console.log('%cData successfully received!', 'color:#76B782; font-size:13px; font-weight:600;');
			console.log(data);
			this.page.dataRecieved = true;
			this.prepareData(data);
			this.initPage(data);
		},

		/**
		 * Мапим данные для соответсвия старой версии
		 * @param data
		 */
		prepareData: function (data) {
			this.page.data = data;
			this.page.type = this.checkPageType(data);
			this.page.landing_complete = data.destination_landing;
			this.page.hash = data.code;
			this.page.successUrl = data.success_url;

			this.page.landing_facebook_code = data.landing_facebook_code;
			this.page.landing_google_tag = data.landing_google_tag;
			this.page.landing_google_analytics = data.landing_google_analytics;
			this.page.landing_iframe = data.landing_iframe;
			this.page.landing_propeller = data.landing_propeller;

			this.page.comebacker = {
				soundUrl: data.comebacker_sound,
				text: data.comebacker_text,
				imageSrc: data.comebacker_image,
				isImage: data.comebacker_image ? 1 : 0,
				isSound: data.comebacker_sound ? 1 : 0,
				landing_complete: data.destination_landing,
				reinitable: data.comebacker_reinitable || false
			};
		},

		/**
		 * Готовим данные из старой версии
		 * @param data
		 */
		prepareOldData: function (data) {
			this.page = $.extend(this.page, data);
			this.page.landing_facebook_code = data.facebookPixelCodeId;
			this.page.landing_google_tag = data.googleTagId;
			this.page.landing_google_analytics = data.googleAnalyticsId;
			this.page.landing_iframe = data.iframeUrl;
			this.page.landing_propeller = data.PropellerAdsImgPixelLeaving;
			this.page.showcaseUrl = data.showcase_url;
		},

		/**
		 * Определение и получение страны
		 * @returns {string} - страна
		 */
		checkCountry: function (callback) {
			var country = null;
			var nodeId = this.queryGET('n');
			var self = this;
			if (nodeId) {
				country = nodeId.replace(/\d/g, '');
				self.page.country = country;
				if (country) console.log('%cDetected country:' + country, 'color:#76B782; font-size:13px; font-weight: 600;');
				else console.log('%cCan not detect country...', 'color:#ff3300; font-size:13px; font-weight: 600;');
				callback();
			} else {
				this.getHeader('X-Static-Region', function (response) {
					response ? country = response.toLowerCase() : false;
					if (country) {
						self.page.country = country.toLowerCase();
						console.log('%cDetected country:' + country, 'color:#76B782; font-size:13px; font-weight: 600;');
					} else {
						console.log('%cCan`t detect country...', 'color:#ff3300; font-size:13px; font-weight: 600;');
					}
					callback();
				});
			}
			return country;
		},

		/**
		 * Определение типа страницы
		 * @param data
		 * @returns {string}
		 */
		checkPageType: function (data) {
			var prelandings = data.prelandings;

			var str = location.hostname;
			var type = 'landing';

			for (var i = 0; i < prelandings.length; i++) {
				if (~prelandings[i].indexOf(str)) {
					type = 'layer';
				}
			}
			console.log('%cDetected page type:' + type, 'color:#76B782');
			return type;

		},

		/**
		 * Инициализация страницы после получения данных
		 * @param data
		 */
		initPage: function (data) {
			var type = this.page.type;
			if (type === 'layer') {
				LeadBit.initLayer.call(LeadBit, data);
			} else {
				LeadBit.initLanding.call(LeadBit, data);
				LeadBit.setData();
			}
		},


		/**
		 * Проверка ноды конкретной страны
		 * @param country
		 */
		checkCountryNode: function (country) {
			this.params.countryNodeChecked = true;
			console.log('checking common node');
			console.log('subdomain', country);
			if (country && this.REDIRECTS.hostsByCountries[country]) {
				var host = this.REDIRECTS.hostsByCountries[country];
				this.getData(host);
			} else this.checkAndSendRequests();
		},

		/**
		 * Проверка всех нод в каждой стране
		 * @param country
		 */
		checkLocalNodes: function (country) {
			var nodes = this.REDIRECTS.nodes[country];
			var host = this.REDIRECTS.host;
			var currentNodeIndex = this.params.localNodesCheckedIndex;
			if (nodes && nodes.length && currentNodeIndex < nodes.length) {
				this.params.localNodesCheckedIndex = currentNodeIndex + 1;
				this.getData(host, nodes[currentNodeIndex]);
			} else {
				this.params.localNodesChecked = true;
				this.checkAndSendRequests();
			}
		},

		/**
		 * Проверка общей ноды региона
		 * @param country
		 */
		checkRegionalNode: function (country) {
			this.params.regionNodeChecked = true;
			var regions = this.REDIRECTS.regions;
			var host = this.REDIRECTS.host;
			var hostsByRegions = this.REDIRECTS.hostsByRegions;

			for (var region in regions) {
				if (~regions[region].indexOf(country)) {
					if (hostsByRegions[region]) {
						host = hostsByRegions[region];
					}
				}
			}

			this.getData(host);
		},

		/**
		 * Проверка общей ноды всего лидбита
		 */
		checkGlobalNode: function () {
			this.params.globalNodeChecked = true;
			this.getData(this.REDIRECTS.host);
		},

		/**
		 * Проверка нод по очереди до получения ответа
		 */
		checkNodesInSequence: function () {
			var nodeId = this.page.nodeId;
			var tid = this.page.tid;

			if (this.page.nodeId && this.page.tid && !this.params.fullDataChecked) {
				this.getData(this.REDIRECTS.host, nodeId, tid);
				this.params.fullDataChecked = true;
				return false;
			}

			if (!this.params.countryNodeChecked && this.page.country) {
				//Проверяем общий узел
				this.checkCountryNode(this.page.country);
			}
			else if (this.page.tid && !this.params.localNodesChecked && this.page.country) {
				this.checkLocalNodes(this.page.country);
			} else if (!this.params.regionNodeChecked && this.page.country) {
				this.checkRegionalNode(this.page.country);
			} else if (!this.params.globalNodeChecked) {
				this.checkGlobalNode();
			} else if (!this.fallbackChecked) {
				this.sendFallbackRequest();
			}
		},


		/**
		 * Проверяем все ноды ОДНОВРЕМЕННО на наличие тида
		 */
		checkNodesAsync: function () {
			var country = this.page.country;
			if (country) {
				if (!this.params.countryNodeChecked) this.checkCountryNode(country);
				if (!this.params.regionNodeChecked) this.checkRegionalNode(country);
			}

			if (!this.params.globalNodeChecked) this.checkGlobalNode();
			if (!this.params.fallbackChecked) this.sendFallbackRequest();
		},


		/**
		 * Отправка фоллбечного запроса на старый лидбит, если других данных нет
		 */
		sendFallbackRequest: function () {
			//Ставим параметр, что был отправлен запрос на старый редирект
			this.params.v1 = true;
			this.params.fallbackChecked = true;

			console.log('%cSending fallback request...', 'color:#3333ff; font-size:13px; font-weight:600;');
			//If ver param exist - this domain is parked
			if (this.queryGET('ver')) {
				//if not in iframe
				if (!window.frameElement) {
					this.params.isParked = true;
					this.getTid();
				}
			} else {
				//Тянем настройки с бека
				var data = {
					v: 2,
					page: this.params.currentUrl,
					iframe: this.page.iframe
				};
				this.extendWithGet(this.params.getToExtend, data);
				//Отправляем TID на случай отсутствия кук
				if (this.queryGET('TID')) {
					data['TID'] = this.queryGET('TID');
				}

				this.jsonp({
					url: this.params.leadBitDomain + 'check-page',
					data: data,
					callback: 'LeadBit.jsonCallback',
					error: function () {
						console.log('%cError encountered! Can not get required data', 'color:#ff3300; font-size:13px; font-weight: 600;');
					}
				});

			}
		},


		/**
		 * Кейс загрузки прокладки
		 * @param  {object} params Параметры загрузки прокладки
		 * @return void
		 */
		initLayer: function (params) {
			this.params = $.extend(this.params, params);
			//Меняем ссылки
			this.replaceLinks(this.page.landing_complete);

			if (this.page.showcaseUrl) this.bindShowcaseToLinks();

			//Запускаем КБ если пришли параметры
			if (typeof this.page.comebacker === 'object') {
				this.initComeBacker(this.page.comebacker);
			}
		},


		/**
		 * Кейс загрузки лендинга
		 * @param  {object} params Параметры загрузки лендинга
		 * @return void
		 */
		initLanding: function (params) {
			this.params = $.extend(this.params, params);

			var TID = this.queryGET('TID') || this.params.TID || this.params.tid || 0,
				formAction = this.getFormAction(),
				form = document.getElementsByTagName('form'),
				additionalFormData = '';
			this.mapGetParams();

			//Прокидываем data в виде hidden полей у форм.
			if (typeof this.params.data === 'object') {
				for (var prop in this.params.data) {
					additionalFormData += '<input type="hidden" name="' + prop + '" value="' + this.params.data[prop] + '" />';
				}
			}
			for (var i = 0; i < form.length; i++) {
				form[i].setAttribute('action', formAction);
				form[i].setAttribute('method', 'POST');
				form[i].setAttribute('id', 'order_form' + i);
				$(form[i]).on('submit', $.proxy(this.validateForm, this));
				this.setLandingValueToForm(form[i]);
				$(form[i]).append(additionalFormData);
			}
			if (!TID && !this.params.TID && this.params.isParked && this.params.TID !== 'error') {
				this.getTid();
			}
		},

		/**
		 * Returns form host based on params
		 * @returns {string}
		 */
		getFormAction: function () {
			var actionHost = this.REDIRECTS.host;
			var tid = this.page.tid || this.params.TID || this.queryGET('TID') || 0;
			var fbsop = this.queryGET('fbsop');
			var flowHash = this.page.hash;
			var successUrl = this.page.successUrl;
			var node = this.page.nodeId;
			var cookieDomain = this.page.cookieDomain;

			if (this.params.v1) {
				actionHost = 'lea' + 'dbit.com';
			} else if(cookieDomain){
				actionHost = cookieDomain;
			}
			else if (this.page.country) {
				actionHost = this.REDIRECTS.hostsByCountries[this.page.country] || this.REDIRECTS.host;
			}

			if (this.params.isParked) {
				actionHost = 'api/conversion/new-from-form';
			} else {
				actionHost += '/conversion/new-from-form';
			}

			actionHost += '?TID=' + tid;

			if (fbsop) actionHost += '&fbsop=' + fbsop;
			if (flowHash) actionHost += '&flowHash=' + flowHash;
			if (successUrl) actionHost += '&success_url=' + successUrl;
			if (node) actionHost += '&node=' + node;

			return '//' + actionHost;
		},

		/**
		 * Проставляем значение landing для поля :landing
		 * @param form
		 */
		setLandingValueToForm: function (form) {
			var hostname = location.hostname;
			if (!form.elements.landing) {
				$(form).append('<input type="hidden" name="landing" value="' + hostname + '" />');
			} else {
				form.elements.landing.value = hostname;
			}
		},

		/**
		 * Получение тида для припаркованного ленда
		 * @return {void}
		 */
		getTid: function () {
			var regexp = /\/(\w{4})\//;
			var hash = regexp.exec(location.pathname)[1];
			if (hash.length) {
				this.jsonp({
					url: 'api/v2/tid/' + hash,
					data: {
						v: 2,
						page: this.params.currentUrl,
						sub1: this.queryGET('sub1'),
						sub2: this.queryGET('sub2'),
						sub3: this.queryGET('sub3'),
						sub4: this.queryGET('sub4'),
						sub5: this.queryGET('sub5')
					},
					callback: 'LeadBit.getTidCallback',
					error: function () {
						console.log('%cError encountered while geting TID!', 'color:#ff3300; font-size:13px; font-weight: 600;');
					}
				});
			}
		},

		/**
		 * Проставляем тид в экшен всех форм.
		 * @param {Object} data
		 * @return {void}
		 */
		getTidCallback: function (data) {
			this.params.TID = data.tid;
			//Если ошибка - то ставим нулевой тид, чтобы предотвратить еще запросы на тид.
			if (data.error) this.params.TID = 'error';
			var formAction = 'api/conversion/new-from-form?TID=' + data.tid,
				regex = new RegExp('\/'),
				hash = document.location.pathname.replace(regex, ''),
				form = document.forms;
			for (var i = 0; i < form.length; i++) {
				form[i].setAttribute('action', formAction);
			}
			//Тянем настройки с бека
			var data = {
				v: 2,
				page: this.params.currentUrl,
				iframe: this.page.iframe,
				callback: 'Lead' + 'Bit.jsonCallback'
			};

			this.extendWithGet(this.params.getToExtend, data);

			this.jsonp({
				url: 'api/check-page',
				data: data,
				callback: 'Lead' + 'Bit.jsonCallback',
				error: function () {
					console.log('%cError encountered while sending check-page!', 'color:#ff3300; font-size:13px; font-weight: 600;');
				}

			});
		},

		/**
		 * Валидация формы при отправке
		 * @param  {Object} event
		 * @return {void}
		 */
		validateForm: function (event) {
			event.preventDefault ? event.preventDefault() : event.returnValue = false;
			var form = document.getElementById(event.target.id),
				name = form.elements.name,
				phone = form.elements.phone,
				countryCode = form.elements.country,
				valid = true,
				countryInfo = (typeof lCountries.countries !== 'undefined') ? lCountries.countries[lCountries.userCountryCode] : {
					phoneError: 'Invalid phone',
					nameError: 'Invalid name',
					countryError: 'Invalid country code'
				};

			if (typeof String.prototype.trim !== 'function') {
				String.prototype.trim = function () {
					return this.replace(/^\s+|\s+$/g, '');
				};
			}

			if (lCountries.userCountryCode.toLowerCase() === 'in') {
				if (phone.value.trim().length <= 10 && phone.value.trim().length > 7) {
					alert(countryInfo.phoneError);
					valid = false;
				}
				if (form.elements.address && form.elements.address.value.trim().length > 0 && form.elements.address.value.trim().length < 5) {
					alert('Invalid address');
					valid = false;
				}
			}

			// Телефон
			if (phone.value.trim().length <= 7) {
				alert(countryInfo.phoneError);
				valid = false;
			}

			if (name.value.trim().length <= 2) {
				alert(countryInfo.nameError);
				valid = false;
			}

			if (countryCode.value.length < 2) {
				alert(countryInfo.countryError);
				valid = false;
			}
			if (valid && !this.params.isSubmited) {
				form.submit();
				this.params.isSubmited = true;
			}
		},

		/**
		 * Кейс загрузки прокладки
		 * @data  {object} params Параметры загрузки прокладки
		 * @return void || boolean
		 */
		jsonCallback: function (data) {
			if (this.page.dataRecieved) return false;
			console.log('%cData from fallback request successfully received!', 'color:#76B782; font-size:13px; font-weight:600;');
			if (data) {
				this.page.dataRecieved = true;
				this.prepareOldData(data);
				this.initPage(data);
			}
		},

		/**
		 * Проставление пикселей в страницы
		 * @param data
		 */
		setData: function () {
			var data = this.page;
			//Check FB pixel
			if (data && data.landing_facebook_code) {
				LeadBit.insertFbId(data.landing_facebook_code);
			}

			//Check GooglePixel
			if (data && data.landing_google_tag) {
				LeadBit.insertGoogleTag(data.landing_google_tag);
			}

			//Check GoogleAnalytics
			if (data && data.landing_google_analytics) {
				LeadBit.insertGoogleAnalytics(data.landing_google_analytics);
			}
			//Check iFrame
			if (data && data.landing_iframe) {
				LeadBit.insertIframe(data.landing_iframe);
			}
			if (data && data.landing_propeller) {
				LeadBit.insertPropellerImg(data.landing_propeller);
			}
		},

		/**
		 * Вставляем facebook id
		 * @data  {object} data Facebook pixel id
		 * @return void
		 */
		insertFbId: function (tagId) {
			var fbScript = '<!-- Facebook Pixel Code --> <script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod? n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version=\'2.0\';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,\'script\',\'https://connect.facebook.net/en_US/fbevents.js\');fbq(\'init\', \'' + tagId + '\');fbq(\'track\', \'PageView\');</script><img height=\'1\' width=\'1\' style=\'display:none\' src=\'https://www.facebook.com/tr?id=' + tagId + '&ev=PageView&noscript=1\'/>';
			document.body.insertAdjacentHTML('beforeend', fbScript);
			!function (f, b, e, v, n, t, s) {
				if (f.fbq) return;
				n = f.fbq = function () {
					n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
				};
				if (!f._fbq) f._fbq = n;
				n.push = n;
				n.loaded = !0;
				n.version = '2.0';
				n.queue = [];
				t = b.createElement(e);
				t.async = !0;
				t.src = v;
				s = b.getElementsByTagName(e)[0];
				s.parentNode.insertBefore(t, s);
			}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
			fbq('init', tagId);
		},

		/**
		 * Вставляем google tag
		 * @tagId  {int} google tag id
		 * @return void
		 */
		insertGoogleTag: function (tagId) {
			var googleScript = '<noscript><iframe src=\'//www.googletagmanager.com/ns.html?id=' + tagId + '\' height=\'0\' width=\'0\' style=\'display:none;visibility:hidden\'></iframe></noscript> <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({\'gtm.start\': new Date().getTime(),event:\'gtm.js\'});var f=d.getElementsByTagName(s)[0], j=d.createElement(s),dl=l!=\'dataLayer\'?\'&l=\'+l:\'\';j.async=true;j.src= \'//www.googletagmanager.com/gtm.js?id=\'+i+dl;f.parentNode.insertBefore(j,f); })(window,document,\'script\',\'dataLayer\',\'' + tagId + '\');</script>';
			document.body.insertAdjacentHTML('beforeend', googleScript);
			(function (w, d, s, l, i) {
				w[l] = w[l] || [];
				w[l].push({
					'gtm.start': new Date().getTime(),
					event: 'gtm.js'
				});
				var f = d.getElementsByTagName(s)[0], j = d.createElement(s), dl = l != 'dataLayer' ? '&l=' + l : '';
				j.async = true;
				j.src = '//www.googletagmanager.com/gtm.js?id=' + i + dl;
				f.parentNode.insertBefore(j, f);
			})(window, document, 'script', 'dataLayer', tagId);
		},

		/**
		 * Вставляем google analitycs id
		 * @tagId  {int} google analitycs id
		 * @return void
		 */
		insertGoogleAnalytics: function (tagId) {
			var googleAnalitycs = '<script>(function(i,s,o,g,r,a,m){i[\'GoogleAnalyticsObject\']=r;i[r]=i[r]||function(){ (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)})(window,document,\'script\',\'https://www.google-analytics.com/analytics.js\',\'ga\');ga(\'create\', \'' + tagId + '\', \'auto\');ga(\'send\', \'pageview\');</script>';
			document.body.insertAdjacentHTML('beforeend', googleAnalitycs);
			(function (i, s, o, g, r, a, m) {
				i['GoogleAnalyticsObject'] = r;
				i[r] = i[r] || function () {
					(i[r].q = i[r].q || []).push(arguments);
				}, i[r].l = 1 * new Date();
				a = s.createElement(o), m = s.getElementsByTagName(o)[0];
				a.async = 1;
				a.src = g;
				m.parentNode.insertBefore(a, m);
			})(window, document, 'script', 'https://www.google-analytics.com/analytics.js', 'ga');
			ga('create', tagId, 'auto');
			ga('send', 'pageview');
		},

		/**
		 * Вставляем iFrame
		 * @iframeUrl  {string} iframeUrl
		 * @return void
		 */
		insertIframe: function (iframeUrl) {
			var iframe = '<iframe style="position: absolute;left:-9999px;" width="1" scrolling="no" height="1" frameborder="0" src="' + iframeUrl + '" seamless="seamless">';
			document.body.insertAdjacentHTML('beforeend', iframe);
		},

		/**
		 * Вставляем pixel от propeller
		 * @param imgSrc
		 */
		insertPropellerImg: function (imgSrc) {
			var img = '<img src="' + imgSrc + '" frameborder="0" width="1" height="1"/>';
			document.body.insertAdjacentHTML('beforeend', img);
		},

		/**
		 * Замена ссылок на прокладке
		 * @param  {String} link URL для замены
		 * @return {void}
		 */
		replaceLinks: function (link) {
			$(function () {
				$('a').attr({
					href: link,
					target: '_blank'
				});
			});
		},


		/**
		 * Открываем витрину после клика на ссылку
		 */
		bindShowcaseToLinks: function () {
			var self = this;
			$('a').on('click', function () {
				window.onbeforeunload = null;
				location.replace(self.page.showcaseUrl);
			});
		},

		/**
		 * Расстановка дат комментариям с интервалом 30-240 минут
		 * @param {[type]} selector [description]
		 */
		setCommentsDate: function (selector) {
			var self = this,
				time = this.params.now;

			$(selector).each(function (index, elem) {
				var timeCut = self.randomInt(30, 240);
				time = time - (timeCut * 60 * 100);
				var dateComment = new Date(time);
				var formatDate = dateComment.getFullYear() + '-' + (dateComment.getMonth() + 1) + '-' + dateComment.getDate() + ' ' + dateComment.getHours() + ':' + dateComment.getMinutes();

				$(elem).html(formatDate);
			});
		},

		/**
		 * Запуск КБ с параметрами
		 * @param  {Object} Параметры для камбекера
		 */
		initComeBacker: function (params) {
			var self = this,
				comebacker = document.createElement('script');

			//Загружаем КБ и после загрузки инициализируем его.
			comebacker.src = '/cdn/js/comebacker/comebacker_new.js';
			comebacker.onload = function () {
				self.ComeBacker = new ComeBacker(params);
			};

			document.getElementsByTagName('head')[0].appendChild(comebacker);
		},

		/**
		 * Запускаем JS тесты по хештегу #testleadbit
		 * @return {void}
		 */
		checkTest: function () {
			$(function () {
				//Проверка тестирования
				if (window.location.hash === '#testlea' + 'dbit') {
					var jsTest = document.createElement('script');
					jsTest.setAttribute('src', '/cdn/js/lead' + 'bit_test.js');

					document.body.appendChild(jsTest);
				}
			});
		},

		/**
		 * Генератор рандомных чисел
		 * @param  {int} min Минимальное значение
		 * @param  {int} max Максимальное значение
		 * @return {int}     Рандомное число
		 */
		randomInt: function (min, max) {
			return Math.floor(Math.random() * (max - min + 1)) + min;
		},

		/**
		 * Получаем GET параметр из URL
		 * @param  {String} name Имя параметра
		 * @return {String}
		 */
		queryGET: function (name) {
			if (name = (new RegExp('[?&]' + encodeURIComponent(name) + '=([^&]*)')).exec(location.search))
				return name[1] ? decodeURIComponent(name[1]) : 0;
		},

		/**
		 * Расширение массива во 2 аргументе
		 * @param params
		 * @param array
		 * @returns {*}
		 */
		extendWithGet: function (params, array) {
			for (var i = 0; i < params.length; i++) {
				var param = this.queryGET(params[i]);
				param ? array[params[i]] = param : false;
			}
			return array;
		},

		/**
		 * Мапим utm параметры из url
		 * @returns {{}}
		 */
		mapGetParams: function () {
			var getParams = {};
			if (this.queryGET('utm_medium')) getParams['utm_medium'] = this.queryGET('utm_medium');
			if (this.queryGET('utm_source')) getParams['utm_source'] = this.queryGET('utm_source');
			if (this.queryGET('utm_campaign')) getParams['utm_campaign'] = this.queryGET('utm_campaign');
			if (this.queryGET('utm_term')) getParams['utm_term'] = this.queryGET('utm_term');
			if (this.queryGET('utm_content')) getParams['utm_content'] = this.queryGET('utm_content');
			if (this.queryGET('gclid')) getParams['gclid'] = this.queryGET('gclid');
			this.params.data = $.extend(this.params.data, getParams);
		},

		/**
		 * Достаем заголовки из страницы
		 * @param headerName
		 * @callback callback
		 */

		getHeader: function (headerName, callback) {
			var request = new XMLHttpRequest();
			request.open('HEAD', location.href, true);
			request.onreadystatechange = function () {
				if (request.readyState === XMLHttpRequest.DONE && request.status === 200) {
					if (typeof callback === 'function') {
						callback(request.getResponseHeader(headerName));
					}
				}
			};

			request.send(null);
		},

		/**
		 * Удаление скрипта
		 * @param el
		 */
		removeScript: function (el) {
			if (el && el.parentElement) {
				el.src = '';
				el.parentElement.removeChild(el);
			}
		}
	};
	$(function () {
		window.LeadBit = new LB();
	});
})();