function doIAAA() {
    document.write(
      "<form action='https://iaaa.pku.edu.cn/iaaa/oauth.jsp' method=post name='formx1' style='display:none'>"
    );
    document.write("<input type=hidden name='appID' value='latex_online'>");
    document.write(
      "<input type=hidden name='appName' value='北京大学LaTeX公共平台'>"
    );
    document.write(
      "<input type=hidden name='redirectUrl' value='https://latex.pku.edu.cn/auth/iaaa'>"
    );
    document.write("</form>");
    setTimeout("document.formx1.submit();", 1000);
  }
  
  if (location.pathname === '/user/settings') {
    window.addEventListener('load', (event) => {
      const ele = document.getElementById('email-input')
      if (ele && !ele.disabled) { ele.disabled = true }
    })
  }
  