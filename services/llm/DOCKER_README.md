# LLM 项目 Docker 部署

本项目已配置完整的Docker部署环境，包含Node.js应用、MongoDB数据库和Redis缓存。

## 快速启动

### 构建并启动所有服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看应用日志
docker-compose logs -f llm-app
```

### 单独启动服务

```bash
# 仅启动数据库服务
docker-compose up -d mongodb redis

# 启动应用（确保数据库已启动）
docker-compose up -d llm-app
```

## 服务端口

- **LLM应用**: http://localhost:9241
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379

## 环境变量

可以通过环境变量覆盖默认配置：

```bash
# 设置环境变量
export MONGO_URL="mongodb://custom-host:27017/mydb"
export REDIS_URL="redis://custom-host:6379"
export PORT=8080

# 使用环境变量启动
docker-compose up -d
```

## 开发模式

对于开发环境，可以挂载代码目录实现热重载：

```yaml
# 在docker-compose.yml中的llm-app服务添加：
volumes:
  - .:/app
  - /app/node_modules
```

## 数据持久化

- MongoDB数据存储在Docker卷 `mongodb_data` 中
- Redis数据存储在Docker卷 `redis_data` 中

## 常用命令

```bash
# 停止所有服务
docker-compose down

# 停止并删除卷（清除所有数据）
docker-compose down -v

# 重新构建应用镜像
docker-compose build llm-app

# 查看资源使用情况
docker-compose top

# 进入容器调试
docker-compose exec llm-app sh
docker-compose exec mongodb mongosh
docker-compose exec redis redis-cli
```

## 健康检查

所有服务都配置了健康检查：

- 应用健康检查：访问API端点
- MongoDB健康检查：执行ping命令
- Redis健康检查：执行ping命令

可以通过以下命令查看健康状态：

```bash
docker-compose ps
```

## 故障排除

### 端口冲突

如果端口已被占用，可以修改docker-compose.yml中的端口映射：

```yaml
ports:
  - "9242:9241"  # 将本地端口改为9242
```

### 数据库连接失败

确保服务启动顺序正确，应用会等待数据库健康检查通过后才启动。

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs

# 查看特定服务日志
docker-compose logs llm-app
docker-compose logs mongodb
docker-compose logs redis

# 实时跟踪日志
docker-compose logs -f llm-app
```