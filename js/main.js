var SLIDER


$(function(){


SLIDER = $('.slider_box').bxSlider({
  mode: 'horizontal',
  captions: true,
  controls: false,
  pager: false,
  adaptiveHeight: true,
  auto: false

});


$('.feedback_call').on('touchend, click', function(){
	console.log($('.block8_content').offset().top);
	   $('html, body').animate({
            scrollTop: $('#block8').offset().top}, 300);
        return false;
});






})