import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str] = mapped_column(String(64), default="BookOpen")
    color: Mapped[str] = mapped_column(String(32), default="#c17f3a")
    labels: Mapped[list[str]] = mapped_column(JSON, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


SYSTEM_CATEGORIES = [
    {"key": "generated", "label": "AI 生成", "icon": "BookOpen", "color": "#c17f3a", "labels": ["AI 生成"], "sort_order": 10},
    {"key": "documents", "label": "文档资料", "icon": "FileText", "color": "#5c3d1e", "labels": ["文档资料"], "sort_order": 20},
    {"key": "imported", "label": "导入内容", "icon": "Download", "color": "#3d6b8a", "labels": ["导入内容"], "sort_order": 30},
    {"key": "youtube", "label": "视频", "icon": "Youtube", "color": "#7a2e1e", "labels": ["视频"], "sort_order": 40},
    {"key": "uncategorized", "label": "未分类", "icon": "Folder", "color": "#8a8a8a", "labels": [], "sort_order": 90},
]

TAG_GENERATED = "AI 生成"
TAG_DOCUMENTS = "文档资料"
TAG_IMPORTED = "导入内容"
TAG_YOUTUBE = "视频"
