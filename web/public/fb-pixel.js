// Meta Pixel (kept as a file so the page's Content-Security-Policy doesn't have to allow inline scripts); not loaded on admin / seller dashboards
(function () {
  if (/^\/(admin|dashboard)(\/|$)/.test(location.pathname)) return;
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1131239006178484');
  fbq('track', 'PageView');
})();
