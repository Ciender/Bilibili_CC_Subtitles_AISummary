通过b站字幕进行AI总结功能，提供DeepSeek chat和responser模型，采用openai标准json，可以自定义链接、模型、apikey等参数，亦可以支持本地模型。 
总结后的内容开头带时间戳，可以点击跳转。支持调整窗口大小与不透明度。  

⚠️使用前请现在脚本开头填入自己的apikey。  

<img width="695" height="529" alt="image" src="https://github.com/user-attachments/assets/d7d4a1ef-95d3-42a8-a275-81f54e9226e0" />  



字幕获取参考了indefined大佬的CChelper插件，https://github.com/indefined/UserScripts/tree/master/bilibiliCCHelper  




本项目采用 MIT License 许可证。  
  



AI Summary Features
This script leverages AI to generate summaries from Bilibili's CC subtitles, offering a powerful way to quickly understand video content.  
Utilizes two distinct DeepSeek models for different needs，including DeepSeek chat and responser model。  

Built on the OpenAI-compatible JSON standard, making it adaptable for various services.  
Easily customize parameters like the API endpoint URL, model name, and API key at the top of the script.  
Supports local models: You can point the API endpoint to your own local server (e.g., Ollama, LM Studio) to use local LLMs for summaries.  

Each point in the summary begins with a timestamp ([HH:MM:SS]). Click it to jump directly to that moment in the video.  


⚠️Before use, please edit the script and enter your own API key at the beginning of the file.  


The subtitle fetching functionality is based on the excellent bilibiliCCHelper plugin by indefined（https://github.com/indefined/UserScripts/tree/master/bilibiliCCHelper）. A big thank you for their foundational work.  
MIT License  
📄 License
This project is licensed under the MIT License.
