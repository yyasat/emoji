<script>
export default {
  onLaunch: function() {
    console.log('App Launched')
	// 进入全屏模式（隐藏状态栏，保留返回键）
	plus.navigator.setFullscreen(true);
  },
  onShow: function() {
    console.log('App Show')
  },
  onHide: function() {
    console.log('App Hide')
  }
}
</script>

<style>
/* 全局样式 */
@import './static/idic.css';
</style>