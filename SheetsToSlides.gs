function refreshCharts(){
  var slideId = "1PIEMmnzEnkg08yB2psDLFA3sdVo3mY8iEhGd2kPLvNI"
  var pres = SlidesApp.openById(slideId)
  var gotSlides = pres.getSlides();

  for (var i = 0; i < gotSlides.length; i++) {
    var slide = gotSlides[i];
    var sheetsCharts = slide.getSheetsCharts();

    for (var k = 0; k < sheetsCharts.length; k++) {
      var shChart = sheetsCharts[k];
      shChart.refresh();
    }
  }
}